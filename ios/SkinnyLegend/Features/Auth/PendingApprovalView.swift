import SwiftUI

/// Spec §10: pending users see a "waiting for approval" screen and nothing else.
struct PendingApprovalView: View {
    @Environment(AppEnvironment.self) private var env
    let user: UserDTO
    @State private var isChecking = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            SurfaceCard(padding: 26) {
                VStack(spacing: 16) {
                    Image(systemName: "hourglass")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundStyle(Theme.primary)
                        .symbolEffect(.pulse, options: .repeat(.continuous))
                    Text(greeting)
                        .typeStyle(.h2)
                        .foregroundStyle(Theme.fg)
                        .multilineTextAlignment(.center)
                    Text("Tài khoản của bạn đang chờ quản trị viên duyệt. Nhắn nhóm chat để được duyệt nhanh hơn nhé.")
                        .typeStyle(.bodyMedium)
                        .foregroundStyle(Theme.fgMuted)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 24)

            Button {
                Task {
                    isChecking = true
                    await env.refreshMe()
                    isChecking = false
                }
            } label: {
                Label("Kiểm tra lại", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.ds(.primary, size: .md))
            .disabled(isChecking)

            Button {
                Task { await env.signOut() }
            } label: {
                if env.isSigningOut {
                    ProgressView().tint(Theme.primary)
                } else {
                    Text("Đăng xuất")
                }
            }
            .buttonStyle(.ds(.ghost, size: .md))
            .disabled(env.isSigningOut)

            Spacer()
        }
    }

    /// A `LocalizedStringKey` (catalog key `Chào %@!`), so the `Text` above resolves it against
    /// the environment locale like every other literal in this view.
    private var greeting: LocalizedStringKey {
        user.displayName.isEmpty ? "Chào bạn!" : "Chào \(user.displayName)!"
    }
}

#Preview("Chờ duyệt") {
    ZStack {
        AppBackground()
        PendingApprovalView(user: UserDTO(id: "u1", firebaseUid: "f1", displayName: "Khoa", avatarKey: nil, role: .member, status: .pending, locale: .vi, createdAt: Date()))
    }
    .environment(AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: false),
                                push: PushRegistrar(api: MockAPIClient(), authorizer: MockPushAuthorizer(), tokens: MockPushTokenSource())))
}
