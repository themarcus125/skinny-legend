import SwiftUI

/// Spec §10: pending users see a "waiting for approval" screen and nothing else.
struct PendingApprovalView: View {
    @Environment(AppEnvironment.self) private var env
    let user: UserDTO
    @State private var isChecking = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            GlassCard(padding: 26) {
                VStack(spacing: 16) {
                    Image(systemName: "hourglass")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundStyle(Theme.ember)
                        .symbolEffect(.pulse, options: .repeat(.continuous))
                    Text(greeting)
                        .font(.roundedLabel(22, weight: .bold))
                        .multilineTextAlignment(.center)
                    Text("Tài khoản của bạn đang chờ quản trị viên duyệt. Nhắn nhóm chat để được duyệt nhanh hơn nhé.")
                        .font(.roundedLabel(15, weight: .medium))
                        .foregroundStyle(.secondary)
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
                    .font(.roundedLabel(16))
                    .padding(.horizontal, 8)
            }
            .buttonStyle(.glassProminent)
            .disabled(isChecking)

            Button("Đăng xuất") { env.signOut() }
                .font(.roundedLabel(15, weight: .medium))
                .foregroundStyle(.secondary)

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
        WarmBackground()
        PendingApprovalView(user: UserDTO(id: "u1", firebaseUid: "f1", displayName: "Khoa", avatarKey: nil, role: .member, status: .pending, locale: .vi, createdAt: Date()))
    }
    .environment(AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: false)))
}
