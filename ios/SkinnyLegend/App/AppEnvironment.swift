import Foundation
import Observation

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
    private static let disabledMessage = "Tài khoản của bạn đã bị khoá. Liên hệ quản trị viên."

    let api: any APIClient
    let auth: any AuthService

    var session: SessionState = .loading

    var currentUser: UserDTO? {
        switch session {
        case .pending(let user), .active(let user): user
        case .loading, .signedOut, .disabled, .failed: nil
        }
    }

    init(api: any APIClient, auth: any AuthService) {
        self.api = api
        self.auth = auth
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
            return AppEnvironment(api: client, auth: auth)
        }
        if !AppMode.isMock {
            print("[AppEnvironment] No GoogleService-Info.plist found and -mockAPI was not passed; falling back to mock services.")
        }
        return AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: true))
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
            apply(try await api.me())
        } catch let error as APIError {
            handle(error)
        } catch {
            session = .failed("Đã có lỗi xảy ra.")
        }
    }

    func signOut() {
        try? auth.signOut()
        session = .signedOut
    }

    private func loadSession() async {
        do {
            apply(try await api.session())
        } catch let error as APIError {
            handle(error)
        } catch {
            session = .failed("Đã có lỗi xảy ra.")
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
