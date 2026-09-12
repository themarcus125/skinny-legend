import AuthenticationServices
import Foundation

enum AuthError: Error, Equatable {
    case cancelled
    case googleUnavailable
    case noPresenter
    case missingToken
    case notSignedIn
    case provider(String)

    var userMessage: String {
        switch self {
        case .cancelled: Localized.string("Đã huỷ đăng nhập.")
        case .googleUnavailable: Localized.string("Đăng nhập Google chưa được cấu hình trên bản dựng này.")
        case .noPresenter: Localized.string("Không mở được cửa sổ đăng nhập.")
        case .missingToken: Localized.string("Không nhận được thông tin đăng nhập.")
        case .notSignedIn: Localized.string("Bạn chưa đăng nhập.")
        case .provider(let message): message
        }
    }
}

/// Owns the Firebase session. Sign-in UI runs on the main actor, so does this.
@MainActor
protocol AuthService: AnyObject {
    /// True when a previous session is still valid, without showing any UI.
    func restoreSession() async -> Bool
    /// A fresh Firebase ID token for the `Authorization: Bearer` header.
    func idToken() async throws -> String
    /// Called from `SignInWithAppleButton`'s request closure: sets scopes and the hashed nonce.
    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest)
    /// Called from `SignInWithAppleButton`'s completion closure: exchanges the Apple credential
    /// for a Firebase session using the raw nonce stored by `prepareAppleRequest`.
    func completeAppleSignIn(_ result: Result<ASAuthorization, any Error>) async throws
    func signInWithGoogle() async throws
    func signOut() throws
    /// False until a real `GoogleService-Info.plist` ships with the app.
    var isGoogleAvailable: Bool { get }
}
