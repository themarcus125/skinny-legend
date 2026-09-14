import AuthenticationServices
import SwiftUI

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var errorMessage: String?
    @State private var isWorking = false
    private let modeStore = AppModeStore.shared

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
                        .foregroundStyle(Theme.primarySoft)
                    Text("Operation\nSkinny Legend")
                        .typeStyle(.h1)
                        .foregroundStyle(Self.textColor(for: backgroundMode))
                        .multilineTextAlignment(.center)
                    Text("Chụp ảnh, ghi điểm, giữ chuỗi.")
                        .typeStyle(.bodyMedium)
                        .foregroundStyle(Self.secondaryTextColor(for: backgroundMode))
                }

                Spacer()

                VStack(spacing: Theme.Space.x3) {
                    // Apple requires its own control, so the two sign-in buttons are matched by
                    // geometry instead: both are `lg` (54 pt) and clipped to radius `lg`.
                    SignInWithAppleButton(.signIn) { request in
                        env.auth.prepareAppleRequest(request)
                    } onCompletion: { result in
                        run { try await env.auth.completeAppleSignIn(result) }
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: Theme.ControlHeight.lg)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))

                    Button {
                        run { try await env.auth.signInWithGoogle() }
                    } label: {
                        Label("Đăng nhập với Google", systemImage: "g.circle.fill")
                    }
                    .buttonStyle(.ds(.primary, size: .lg, fullWidth: true))
                    .disabled(!env.auth.isGoogleAvailable)

                    // Only ever shown when `GoogleService-Info.plist` carries no CLIENT_ID.
                    if !env.auth.isGoogleAvailable {
                        Text("Đăng nhập Google chưa được cấu hình trên bản dựng này.")
                            .typeStyle(.caption)
                            .foregroundStyle(Self.secondaryTextColor(for: backgroundMode))
                            .multilineTextAlignment(.center)
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .typeStyle(.caption)
                            .foregroundStyle(Theme.destructive)
                            .multilineTextAlignment(.center)
                    }

                    #if DEBUG
                    // Debug builds only: run the whole app against `MockAPIClient` without a
                    // relaunch, so the UI can be worked on with no backend and no Firebase.
                    Button {
                        modeStore.enterMockMode(outgoing: env.push)
                    } label: {
                        // The label carries its own colour: over the video the ghost variant's
                        // ink `primary` would be invisible.
                        Text("Dùng dữ liệu mẫu")
                            .foregroundStyle(Self.textColor(for: backgroundMode))
                    }
                    .buttonStyle(.ds(.ghost, size: .md, fullWidth: true))
                    #endif
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
                errorMessage = Localized.string("Đăng nhập thất bại.")
            }
            isWorking = false
        }
    }
}

#Preview("Đăng nhập") {
    SignInView()
        .environment(AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: false),
                                push: PushRegistrar(api: MockAPIClient(), authorizer: MockPushAuthorizer(), tokens: MockPushTokenSource())))
}
