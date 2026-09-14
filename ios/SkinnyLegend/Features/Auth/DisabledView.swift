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
            SurfaceCard(padding: 26) {
                VStack(spacing: 16) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundStyle(Theme.primary)
                    Text("Tài khoản đã bị khoá")
                        .typeStyle(.h2)
                        .foregroundStyle(Theme.fg)
                        .multilineTextAlignment(.center)
                    Text(message)
                        .typeStyle(.bodyMedium)
                        .foregroundStyle(Theme.fgMuted)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 24)

            Button {
                Task { await env.signOut() }
            } label: {
                Group {
                    if env.isSigningOut {
                        ProgressView().tint(Theme.fgOnAccent)
                    } else {
                        Text("Đăng xuất")
                    }
                }
            }
            .buttonStyle(.ds(.primary, size: .lg, fullWidth: true))
            .disabled(env.isSigningOut)
            .padding(.horizontal, 24)

            Spacer()
        }
    }
}

#Preview("Đã khoá") {
    ZStack {
        AppBackground()
        DisabledView(message: "Tài khoản của bạn đã bị khoá. Liên hệ quản trị viên.")
    }
    .environment(AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: false),
                                push: PushRegistrar(api: MockAPIClient(), authorizer: MockPushAuthorizer(), tokens: MockPushTokenSource())))
}
