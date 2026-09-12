import Foundation
import Observation
import OSLog

/// The single object every screen reads from `@Environment`. Owns the API client, the auth
/// service and the signed-in session state.
@MainActor
@Observable
final class AppEnvironment {
    enum SessionState: Equatable {
        case loading
        case signedOut
        case pending(UserDTO)
        case active(UserDTO)
        /// A disabled account: `authenticate` (apps/api/src/middleware/auth.ts) rejects the
        /// request with 403 `disabled` before `/auth/session` or `/me` can return a body, so
        /// there is no `UserDTO` to carry here — only a message and a way back to sign-in.
        case disabled(String)
        case failed(String)
    }

    /// Shared copy for the disabled state, however it's reached (a `status: disabled` body, or
    /// the more common real-API shape: a 403 `disabled` thrown before any body comes back).
    /// Computed so it follows the in-app language instead of freezing at first use.
    private static var disabledMessage: String {
        Localized.string("Tài khoản của bạn đã bị khoá. Liên hệ quản trị viên.")
    }

    let api: any APIClient
    let auth: any AuthService
    /// Notification permission and FCM token registration (spec §E).
    let push: PushRegistrar
    let placeSearch: any PlaceSearching
    let locator: any LocationFixing
    /// Where the language choice is persisted, under `AppLocale.storageKey`. Injected so tests
    /// can hand in a throwaway suite instead of writing to the process-wide defaults.
    private let defaults: UserDefaults
    private let log = Logger(subsystem: "com.themarcus125.skinnylegend", category: "locale")

    var session: SessionState = .loading

    /// The user's language choice (spec §D). `.system` follows the device; `vi`/`en` pin it.
    /// This is local state — the server only ever sees the *resolved* `UserDTO.Locale`.
    private(set) var appLocale: AppLocale

    /// What the whole view tree runs under (`.environment(\.locale, …)` at the root), so every
    /// `Text`/`LocalizedStringKey` re-renders the moment the picker changes.
    var resolvedLocale: Locale { appLocale.resolved().locale }

    /// The concrete language the server is told about — `.system` still resolves to one, because
    /// server-side copy (AI reasons, push templates) cannot follow "whatever this phone is set to".
    var serverLocale: UserDTO.Locale { UserDTO.Locale(appLocale.resolved()) }

    var currentUser: UserDTO? {
        switch session {
        case .pending(let user), .active(let user): user
        case .loading, .signedOut, .disabled, .failed: nil
        }
    }

    init(
        api: any APIClient,
        auth: any AuthService,
        push: PushRegistrar,
        placeSearch: any PlaceSearching = MapKitPlaceSearch(),
        locator: any LocationFixing = CoreLocationFixer(),
        defaults: UserDefaults = .standard
    ) {
        self.api = api
        self.auth = auth
        self.push = push
        self.placeSearch = placeSearch
        self.locator = locator
        self.defaults = defaults
        self.appLocale = AppLocale(rawValue: defaults.string(forKey: AppLocale.storageKey) ?? "") ?? .system
        // The FCM token-refresh callback lands in `AppDelegate`, outside the SwiftUI environment.
        PushTokenRefresh.shared.registrar = push
    }

    /// Chooses mock or live wiring once, at launch (spec §14). Gated on `useLiveBackend`
    /// (not just `!isMock`): a launch without `-mockAPI` and without a `GoogleService-Info.plist`
    /// — e.g. a fresh checkout before the Firebase project is wired up — must still land on the
    /// mock services instead of constructing `FirebaseAuthService`, which talks to `Auth.auth()`
    /// and crashes when no `FirebaseApp` has been configured.
    static func make() -> AppEnvironment {
        if AppMode.useLiveBackend {
            let auth = FirebaseAuthService()
            let client = LiveAPIClient(baseURL: AppMode.apiBaseURL, tokenProvider: { [weak auth] in
                guard let auth else { throw APIError.unauthenticated }
                return try await auth.idToken()
            })
            let push = PushRegistrar(api: client, authorizer: SystemPushAuthorizer(), tokens: FirebaseTokenSource())
            return AppEnvironment(api: client, auth: auth, push: push,
                                  placeSearch: MapKitPlaceSearch(), locator: CoreLocationFixer())
        }
        if !AppMode.isMock {
            print("[AppEnvironment] No GoogleService-Info.plist found and -mockAPI was not passed; falling back to mock services.")
        }
        let client = MockAPIClient()
        // The authorizer stays real in mock mode so the Simulator still shows the system
        // permission prompt; only the FCM token (which needs an APNs key) is faked.
        let push = PushRegistrar(api: client, authorizer: SystemPushAuthorizer(), tokens: MockPushTokenSource())
        return AppEnvironment(api: client, auth: MockAuthService(startSignedIn: true), push: push,
                              placeSearch: MockPlaceSearch(), locator: MockLocationFixer())
    }

    // MARK: - Language

    /// Points `Localized` (the lookup every plain-`String` site reads) at the stored choice.
    /// Called once at launch by `make()` rather than from `init`, because `Localized` is
    /// process-global and test suites construct environments in parallel.
    func activateLocale() {
        Localized.setLanguage(appLocale.resolved())
    }

    /// Applies the choice locally first — `Localized` before `appLocale`, so the re-render the
    /// observable change triggers already reads the new language — persists it, and then tells
    /// the server. A failed `PATCH` is logged, not surfaced: the local preference is the source
    /// of truth for this device, and `reconcileServerLocale` retries on the next sign-in.
    func setAppLocale(_ choice: AppLocale) async {
        Localized.setLanguage(choice.resolved())
        appLocale = choice
        defaults.set(choice.rawValue, forKey: AppLocale.storageKey)
        guard currentUser != nil else { return }
        await pushLocale(serverLocale)
        // The device row carries its own locale (the job's fallback), so keep it in step.
        if push.isEnabled { await push.registerCurrentToken() }
    }

    /// The stored preference wins over whatever the server holds: if `me.locale` disagrees with
    /// the resolved choice (the console changed it, or a `PATCH` was dropped), push ours.
    private func reconcileServerLocale(with user: UserDTO) async {
        guard user.status != .disabled, user.locale != serverLocale else { return }
        await pushLocale(serverLocale)
    }

    /// Best-effort `PATCH /me { locale }`; the returned row replaces the session's copy.
    private func pushLocale(_ locale: UserDTO.Locale) async {
        do {
            let user = try await api.updateMe(displayName: nil, avatarKey: nil, locale: locale)
            if currentUser != nil { apply(user) }
        } catch {
            log.error("PATCH /me locale=\(locale.rawValue, privacy: .public) failed: \(String(describing: error), privacy: .public)")
        }
    }

    /// Restores the Firebase session, then upserts the user through `POST /auth/session`.
    func bootstrap() async {
        session = .loading
        guard await auth.restoreSession() else {
            session = .signedOut
            return
        }
        await loadSession()
    }

    /// Called after a successful sign-in tap.
    func didSignIn() async {
        session = .loading
        await loadSession()
    }

    /// Re-reads `GET /me` after a profile edit or an admin approval.
    func refreshMe() async {
        do {
            let user = try await api.me()
            apply(user)
            await reconcileServerLocale(with: user)
        } catch let error as APIError {
            handle(error)
        } catch {
            session = .failed(Localized.string("Đã có lỗi xảy ra."))
        }
    }

    /// Unregisters the device first — while the ID token that `DELETE /me/devices` needs is still
    /// valid — so a signed-out phone stops receiving this account's reminders, and clears the
    /// install-scoped push flags so the next account is asked afresh (spec §E).
    func signOut() async {
        await push.resetForSignOut()
        try? auth.signOut()
        session = .signedOut
    }

    private func loadSession() async {
        do {
            let user = try await api.session()
            apply(user)
            await reconcileServerLocale(with: user)
        } catch let error as APIError {
            handle(error)
        } catch {
            session = .failed(Localized.string("Đã có lỗi xảy ra."))
        }
    }

    /// `POST /auth/session` and `GET /me` return the user row (with its `status`) rather than a
    /// 403 for a pending account, so routing branches on `status` here. In practice `disabled`
    /// never reaches this path — `authenticate` throws a 403 before either endpoint returns a
    /// body (see `handle(_:)`) — but the branch is kept so the state machine stays correct if
    /// that ever changes.
    private func apply(_ user: UserDTO) {
        switch user.status {
        case .active: session = .active(user)
        case .pending: session = .pending(user)
        case .disabled: session = .disabled(Self.disabledMessage)
        }
    }

    /// A 403 `pending_approval` can still arrive from other endpoints (e.g. a stale token racing
    /// an admin's action); that's surfaced as a generic, retryable failure rather than
    /// synthesising a placeholder user, since `session()`/`me()` are what carry the real one. A
    /// 403 `disabled`, though, is the *normal* shape for a disabled account — `authenticate`
    /// rejects the request before `/auth/session` or `/me` return anything — so it gets routed to
    /// its own state rather than falling into the generic "Thử lại" failure screen.
    private func handle(_ error: APIError) {
        if error.isUnauthenticated {
            try? auth.signOut()
            session = .signedOut
        } else if error.isDisabled {
            session = .disabled(Self.disabledMessage)
        } else {
            session = .failed(error.userMessage)
        }
    }
}
