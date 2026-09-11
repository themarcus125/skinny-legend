import AuthenticationServices
import Foundation

/// Offline stand-in: sign-in succeeds instantly and the token is a constant the mock API ignores.
@MainActor
final class MockAuthService: AuthService {
    private(set) var isSignedIn: Bool

    init(startSignedIn: Bool = true) {
        self.isSignedIn = startSignedIn
    }

    var isGoogleAvailable: Bool { true }

    func restoreSession() async -> Bool { isSignedIn }

    func idToken() async throws -> String {
        guard isSignedIn else { throw AuthError.notSignedIn }
        return "mock-id-token"
    }

    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        request.requestedScopes = [.fullName, .email]
    }

    func completeAppleSignIn(_ result: Result<ASAuthorization, any Error>) async throws {
        try? await Task.sleep(for: .milliseconds(250))
        isSignedIn = true
    }

    func signInWithGoogle() async throws {
        try? await Task.sleep(for: .milliseconds(250))
        isSignedIn = true
    }

    func signOut() throws {
        isSignedIn = false
    }
}
