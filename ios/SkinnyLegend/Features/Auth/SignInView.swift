import AuthenticationServices
import SwiftUI

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var errorMessage: String?
    @State private var isWorking = false

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            VStack(spacing: 14) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 72, weight: .bold))
                    .foregroundStyle(LinearGradient(colors: [Theme.ember, Theme.flame], startPoint: .top, endPoint: .bottom))
                Text("Operation\nSkinny Legend")
                    .font(.roundedLabel(34, weight: .heavy))
                    .multilineTextAlignment(.center)
                Text("Chụp ảnh, ghi điểm, giữ chuỗi.")
                    .font(.roundedLabel(16, weight: .medium))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(spacing: 12) {
                SignInWithAppleButton(.signIn) { request in
                    env.auth.prepareAppleRequest(request)
                } onCompletion: { result in
                    run { try await env.auth.completeAppleSignIn(result) }
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 52)
                .clipShape(Capsule())

                Button {
                    run { try await env.auth.signInWithGoogle() }
                } label: {
                    Label("Đăng nhập với Google", systemImage: "g.circle.fill")
                        .font(.roundedLabel(17))
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                }
                .buttonStyle(.glass)
                .disabled(!env.auth.isGoogleAvailable)

                if !env.auth.isGoogleAvailable {
                    Text("Đăng nhập Google chưa được cấu hình trên bản dựng này.")
                        .font(.roundedLabel(12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.roundedLabel(13, weight: .medium))
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }
            }
            .disabled(isWorking)
            .overlay { if isWorking { ProgressView() } }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
    }

    @MainActor
    private func run(_ operation: @escaping @MainActor () async throws -> Void) {
        Task { @MainActor in
            isWorking = true
            errorMessage = nil
            do {
                try await operation()
                await env.didSignIn()
            } catch let error as AuthError {
                if error != .cancelled { errorMessage = error.userMessage }
            } catch let error as APIError {
                errorMessage = error.userMessage
            } catch {
                errorMessage = "Đăng nhập thất bại."
            }
            isWorking = false
        }
    }
}

#Preview("Đăng nhập") {
    ZStack {
        WarmBackground()
        SignInView()
    }
    .environment(AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: false)))
}
