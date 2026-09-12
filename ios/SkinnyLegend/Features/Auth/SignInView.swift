import AuthenticationServices
import SwiftUI

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var errorMessage: String?
    @State private var isWorking = false

    /// The mode `SignInBackground` is actually rendering (it reports player failures back through
    /// this binding). Seeded with the same rule the background uses so the first frame already matches.
    @State private var backgroundMode = SignInBackground.mode(
        reduceMotion: UIAccessibility.isReduceMotionEnabled,
        assetAvailable: SignInBackground.assetURL != nil
    )

    /// Text stays legible over either layer: white against the video's dark gradient,
    /// the default palette against the warm gradient.
    nonisolated static func textColor(for mode: SignInBackgroundMode) -> Color {
        mode == .video ? .white : .primary
    }

    nonisolated static func secondaryTextColor(for mode: SignInBackgroundMode) -> Color {
        mode == .video ? .white.opacity(0.85) : .secondary
    }

    var body: some View {
        ZStack {
            SignInBackground(mode: $backgroundMode)
                .ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer()

                VStack(spacing: 14) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 72, weight: .bold))
                        .foregroundStyle(LinearGradient(colors: [Theme.ember, Theme.flame], startPoint: .top, endPoint: .bottom))
                    Text("Operation\nSkinny Legend")
                        .font(.roundedLabel(34, weight: .heavy))
                        .foregroundStyle(Self.textColor(for: backgroundMode))
                        .multilineTextAlignment(.center)
                    Text("Chụp ảnh, ghi điểm, giữ chuỗi.")
                        .font(.roundedLabel(16, weight: .medium))
                        .foregroundStyle(Self.secondaryTextColor(for: backgroundMode))
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
                            .foregroundStyle(Self.secondaryTextColor(for: backgroundMode))
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
    SignInView()
        .environment(AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: false)))
}
