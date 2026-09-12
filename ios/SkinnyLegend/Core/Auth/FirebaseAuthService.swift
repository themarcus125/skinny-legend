import AuthenticationServices
import CryptoKit
import FirebaseAuth
import Foundation
import GoogleSignIn
import OSLog
import UIKit

/// Sign in with Apple and Google, both exchanged for a Firebase session (spec §3).
@MainActor
final class FirebaseAuthService: AuthService {
    /// Raw nonce for the in-flight Apple request; Firebase needs it to verify the identity token.
    private var currentNonce: String?
    private let log = Logger(subsystem: "com.themarcus125.skinnylegend", category: "auth")

    var isGoogleAvailable: Bool { Self.googleClientID != nil }

    private static var googleClientID: String? {
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let plist = NSDictionary(contentsOfFile: path),
              let clientID = plist["CLIENT_ID"] as? String,
              !clientID.isEmpty
        else { return nil }
        return clientID
    }

    func restoreSession() async -> Bool {
        Auth.auth().currentUser != nil
    }

    func idToken() async throws -> String {
        guard let user = Auth.auth().currentUser else { throw AuthError.notSignedIn }
        do {
            return try await user.getIDToken()
        } catch {
            log.error("ID token refresh failed: \(error.localizedDescription, privacy: .public)")
            throw AuthError.provider(Localized.string("Không thể làm mới phiên đăng nhập. Vui lòng đăng nhập lại."))
        }
    }

    // MARK: - Apple

    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        currentNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
    }

    func completeAppleSignIn(_ result: Result<ASAuthorization, any Error>) async throws {
        let authorization: ASAuthorization
        switch result {
        case .success(let value):
            authorization = value
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code == .canceled {
                throw AuthError.cancelled
            }
            throw providerFailure("Apple", error)
        }

        guard let nonce = currentNonce else { throw AuthError.missingToken }
        currentNonce = nil

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8)
        else { throw AuthError.missingToken }

        let firebaseCredential = OAuthProvider.appleCredential(withIDToken: idToken, rawNonce: nonce, fullName: credential.fullName)
        do {
            _ = try await Auth.auth().signIn(with: firebaseCredential)
        } catch {
            throw providerFailure("Apple", error)
        }
    }

    // MARK: - Google

    func signInWithGoogle() async throws {
        guard let clientID = Self.googleClientID else { throw AuthError.googleUnavailable }
        guard let presenter = Self.topViewController() else { throw AuthError.noPresenter }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else { throw AuthError.missingToken }
            let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: result.user.accessToken.tokenString)
            _ = try await Auth.auth().signIn(with: credential)
        } catch let error as AuthError {
            throw error
        } catch let error as NSError where error.code == GIDSignInError.canceled.rawValue {
            throw AuthError.cancelled
        } catch {
            throw providerFailure("Google", error)
        }
    }

    func signOut() throws {
        GIDSignIn.sharedInstance.signOut()
        try Auth.auth().signOut()
    }

    // MARK: - Helpers

    /// SDK errors (`error.localizedDescription`) are raw English strings not meant for end
    /// users; log the real one and surface a localized generic instead.
    private func providerFailure(_ provider: String, _ error: any Error) -> AuthError {
        log.error("\(provider, privacy: .public) sign-in failed: \(error.localizedDescription, privacy: .public)")
        return .provider(Localized.string("Đăng nhập với \(provider) thất bại. Vui lòng thử lại."))
    }

    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        var controller = scene?.keyWindow?.rootViewController
        while let presented = controller?.presentedViewController {
            controller = presented
        }
        return controller
    }

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
