import SwiftUI

/// Shown when an admin has disabled the account. `authenticate`
/// (apps/api/src/middleware/auth.ts) rejects every request with 403 `disabled` before any
/// endpoint can return a `UserDTO`, so there's no profile data to greet with here — only the
/// reason and a way back to sign-in.
struct DisabledView: View {
    @Environment(AppEnvironment.self) private var env
    let message: String

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            GlassCard(padding: 26) {
                VStack(spacing: 16) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundStyle(Theme.ember)
                    Text("Tài khoản đã bị khoá")
                        .font(.roundedLabel(22, weight: .bold))
                        .multilineTextAlignment(.center)
                    Text(message)
                        .font(.roundedLabel(15, weight: .medium))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 24)

            Button {
                Task { await env.signOut() }
            } label: {
                Group {
                    if env.isSigningOut {
                        ProgressView()
                    } else {
                        Text("Đăng xuất")
                            .font(.roundedLabel(16))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.glassProminent)
            .disabled(env.isSigningOut)
            .padding(.horizontal, 24)

            Spacer()
        }
    }
}

#Preview("Đã khoá") {
    ZStack {
        WarmBackground()
        DisabledView(message: "Tài khoản của bạn đã bị khoá. Liên hệ quản trị viên.")
    }
    .environment(AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: false),
                                push: PushRegistrar(api: MockAPIClient(), authorizer: MockPushAuthorizer(), tokens: MockPushTokenSource())))
}
