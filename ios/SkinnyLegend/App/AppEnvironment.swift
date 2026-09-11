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
        case failed(String)
    }

    let api: any APIClient
    let auth: any AuthService

    var session: SessionState = .loading

    var currentUser: UserDTO? {
        switch session {
        case .pending(let user), .active(let user): user
        case .loading, .signedOut, .failed: nil
        }
    }

    init(api: any APIClient, auth: any AuthService) {
        self.api = api
        self.auth = auth
    }

    /// Chooses mock or live wiring once, at launch (spec §14).
    static func make() -> AppEnvironment {
        if AppMode.isMock {
            return AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: true))
        }
        let auth = FirebaseAuthService()
        let client = LiveAPIClient(baseURL: AppMode.apiBaseURL, tokenProvider: { [weak auth] in
            guard let auth else { throw APIError.unauthenticated }
            return try await auth.idToken()
        })
        return AppEnvironment(api: client, auth: auth)
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
    /// 403 for a pending or disabled account, so routing branches on `status` here.
    private func apply(_ user: UserDTO) {
        switch user.status {
        case .active: session = .active(user)
        case .pending: session = .pending(user)
        case .disabled: session = .failed("Tài khoản đã bị vô hiệu hoá.")
        }
    }

    /// A 403 `pending_approval`/`disabled` can still arrive from other endpoints (e.g. a stale
    /// token racing an admin's action); those are surfaced as a generic, retryable failure rather
    /// than synthesising a placeholder user, since `session()`/`me()` are what carry the real one.
    private func handle(_ error: APIError) {
        if error.isUnauthenticated {
            try? auth.signOut()
            session = .signedOut
        } else {
            session = .failed(error.userMessage)
        }
    }
}
