import Foundation
import Observation
import UserNotifications

/// Owns notification permission and FCM token registration (spec §E). Permission is only ever
/// requested from `enable()` — the Account toggle — or `requestAfterFirstConfirmedEntry()`,
/// never at launch.
@MainActor
@Observable
final class PushRegistrar {
    enum Permission: Equatable {
        case unknown
        case notDetermined
        case authorized
        case denied
    }

    /// Set once *this user* has been asked after their first confirmed entry. Scoped per user
    /// id and kept across sign-out, so a returning member who explicitly turned reminders OFF is
    /// not silently re-enabled by their next confirmed entry, while a different account on the
    /// same phone is still asked afresh.
    static func didAskKey(for userID: String) -> String { "push.didAsk.\(userID)" }
    /// Mirrors the Account toggle, so a relaunch renders the right state before `refresh()` lands.
    static let enabledKey = "push.isEnabled"
    /// Reminders are ON but no token has reached the server yet (see `isRegistrationPending`).
    static let pendingKey = "push.registrationPending"
    /// How long a sign-out waits for `DELETE /me/devices` before giving up on it.
    static let defaultSignOutDeadline: Duration = .seconds(4)

    private let api: any APIClient
    private let authorizer: any PushAuthorizing
    private let tokens: any PushTokenSource
    private let defaults: UserDefaults
    /// A pinned locale (tests). `nil` reads the app's resolved language at every registration,
    /// so a language change in Account is what the next `POST /me/devices` carries.
    private let fixedLocale: DeviceLocale?
    private let signOutDeadline: Duration

    private(set) var permission: Permission = .unknown
    private(set) var isEnabled: Bool
    /// Firebase refuses to mint an FCM token until APNs has delivered its own, which happens
    /// asynchronously after `registerForRemoteNotifications()` — so the first `enable()` on a
    /// fresh install usually cannot register straight away. The intent is recorded here (and
    /// persisted) and the `didReceiveRegistrationToken` callback finishes the job through
    /// `handleTokenRefresh()`.
    private(set) var isRegistrationPending: Bool
    private(set) var isBusy = false
    private(set) var errorMessage: String?
    private(set) var registeredToken: String?

    /// Bumped by everything that turns reminders off (`disable()`, sign-out, the 401 teardown).
    /// Every registration path snapshots it and re-checks after each `await`, so a continuation
    /// that resumes after the user signed out cannot write state or re-`POST` the previous
    /// account's token.
    private var generation = 0

    init(
        api: any APIClient,
        authorizer: any PushAuthorizing,
        tokens: any PushTokenSource,
        defaults: UserDefaults = .standard,
        locale: DeviceLocale? = nil,
        signOutDeadline: Duration = PushRegistrar.defaultSignOutDeadline
    ) {
        self.api = api
        self.authorizer = authorizer
        self.tokens = tokens
        self.defaults = defaults
        self.fixedLocale = locale
        self.signOutDeadline = signOutDeadline
        self.isEnabled = defaults.bool(forKey: Self.enabledKey)
        self.isRegistrationPending = defaults.bool(forKey: Self.pendingKey)
    }

    /// The locale sent with the token: the app's *resolved* language (spec §D), never the
    /// device language, because the server's push copy follows what the app is running in.
    private var locale: DeviceLocale { fixedLocale ?? .current }

    /// `.provisional` and `.ephemeral` deliver notifications, so they count as authorized.
    static func permission(from status: UNAuthorizationStatus) -> Permission {
        switch status {
        case .notDetermined: .notDetermined
        case .authorized, .provisional, .ephemeral: .authorized
        case .denied: .denied
        @unknown default: .denied
        }
    }

    /// Re-reads the system setting. Permission revoked in Settings turns the toggle off.
    func refresh() async {
        permission = Self.permission(from: await authorizer.authorizationStatus())
        errorMessage = nil
        if permission != .authorized, isEnabled {
            setEnabled(false)
            setPending(false)
        }
    }

    /// Account toggle ON. Prompts when undecided, then registers the token. Returns `true` only
    /// once the server holds the token; `false` with `isRegistrationPending` set means the
    /// toggle is on and the token callback will complete the registration.
    @discardableResult
    func enable() async -> Bool {
        let generation = self.generation
        isBusy = true
        errorMessage = nil
        // A sign-out or `disable()` that overtook this call owns `isBusy` from then on.
        defer { if isCurrent(generation) { isBusy = false } }

        if permission == .unknown { await refresh() }
        guard isCurrent(generation) else { return false }
        if permission == .notDetermined {
            let granted = (try? await authorizer.requestAuthorization()) ?? false
            guard isCurrent(generation) else { return false }
            permission = granted ? .authorized : .denied
        }
        guard permission == .authorized else {
            setEnabled(false)
            return false
        }
        // Intent first: the APNs → FCM token handshake can outlive this call.
        setEnabled(true)
        await authorizer.registerForRemoteNotifications()
        guard isCurrent(generation) else { return false }
        let registered = await registerCurrentToken()
        guard isCurrent(generation) else { return false }
        if !registered, !isRegistrationPending { setEnabled(false) }
        return registered
    }

    /// Sends the current FCM token to `POST /me/devices`. A token that is not available yet
    /// (no APNs token, so FCM has nothing to hand out) is not an error: the registration is
    /// marked pending and `handleTokenRefresh()` retries when Firebase delivers one.
    @discardableResult
    func registerCurrentToken() async -> Bool {
        let generation = self.generation
        if permission == .unknown { await refresh() }
        guard isCurrent(generation), permission == .authorized else { return false }
        let token = try? await tokens.currentToken()
        guard isCurrent(generation) else { return false }
        guard let token, !token.isEmpty else {
            setPending(true)
            return false
        }
        do {
            try await api.registerDevice(token: token, platform: .ios, locale: locale)
            guard isCurrent(generation) else {
                // The row landed after a `disable()`/sign-out already deleted it. Take it back
                // down unless something re-registered in the meantime (a new account's row must
                // stay). Best effort: after a sign-out the ID token is gone and this simply fails.
                if !isEnabled, !isRegistrationPending {
                    try? await api.unregisterDevice(token: token)
                }
                return false
            }
            registeredToken = token
            errorMessage = nil
            setEnabled(true)
            setPending(false)
            return true
        } catch let error as APIError {
            guard isCurrent(generation) else { return false }
            errorMessage = error.userMessage
            return false
        } catch {
            guard isCurrent(generation) else { return false }
            errorMessage = Localized.string("Không bật được thông báo, hãy thử lại.")
            return false
        }
    }

    /// The FCM `didReceiveRegistrationToken` callback. Only a user who has reminders ON (or
    /// whose first registration is still waiting on a token) gets re-registered; a rotated
    /// token must never undo `disable()`.
    func handleTokenRefresh() async {
        guard isEnabled || isRegistrationPending else { return }
        await registerCurrentToken()
    }

    /// Account toggle OFF. Local state is cleared first — so a token callback or an `enable()`
    /// still in flight cannot re-register — then the row is dropped. Best effort: a failed
    /// DELETE still leaves the toggle off, and the job drops the token the first time FCM
    /// reports it as unregistered.
    func disable() async {
        var token = registeredToken
        clearLocalState()
        isBusy = true
        defer { isBusy = false }
        if token == nil { token = try? await tokens.currentToken() }
        guard let token else { return }
        try? await api.unregisterDevice(token: token)
    }

    /// Spec §E: "Permission is requested after the user's first confirmed entry, never at
    /// launch." Runs at most once per user on this phone, whether or not they say yes.
    func requestAfterFirstConfirmedEntry(userID: String) async {
        let key = Self.didAskKey(for: userID)
        guard !defaults.bool(forKey: key) else { return }
        defaults.set(true, forKey: key)
        await enable()
    }

    /// Sign-out. Clears every install-scoped flag synchronously — before any `await`, so
    /// nothing in flight can resurrect the previous account's registration — then drops the
    /// server-side row while the caller's ID token is still valid, bounded by `signOutDeadline`
    /// so an offline sign-out never hangs. The per-user "asked" flag is deliberately kept.
    func resetForSignOut() async {
        let token = registeredToken
        let hadRegistration = isEnabled || isRegistrationPending || token != nil
        clearLocalState()
        guard hadRegistration else { return }
        isBusy = true
        defer { isBusy = false }
        await deleteRow(token, within: signOutDeadline)
    }

    /// The synchronous half of sign-out, also the 401 teardown: forget the registration locally
    /// and invalidate every in-flight registration, without touching the server.
    func clearLocalState() {
        generation += 1
        isBusy = false
        registeredToken = nil
        errorMessage = nil
        setEnabled(false)
        setPending(false)
    }

    /// `DELETE /me/devices` for `token` (or, after a relaunch, for whatever FCM hands out now),
    /// but never for longer than `deadline`: `LiveAPIClient` first waits on a Firebase ID token
    /// and then up to 30 s on the request, and neither honours cancellation reliably. The
    /// DELETE runs in its own task and races a timer in a task group; the loser is cancelled,
    /// and a loser that keeps running regardless is abandoned rather than waited for.
    private func deleteRow(_ token: String?, within deadline: Duration) async {
        let (finished, done) = AsyncStream<Void>.makeStream()
        let work = Task { @MainActor [self] in
            defer { done.finish() }
            var token = token
            if token == nil { token = try? await tokens.currentToken() }
            guard let token, !Task.isCancelled else { return }
            try? await api.unregisterDevice(token: token)
        }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { for await _ in finished {} }
            group.addTask { try? await Task.sleep(for: deadline) }
            await group.next()
            group.cancelAll()
        }
        work.cancel()
    }

    private func isCurrent(_ snapshot: Int) -> Bool { snapshot == generation }

    private func setEnabled(_ value: Bool) {
        isEnabled = value
        defaults.set(value, forKey: Self.enabledKey)
    }

    private func setPending(_ value: Bool) {
        isRegistrationPending = value
        defaults.set(value, forKey: Self.pendingKey)
    }
}
