import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        ZStack {
            WarmBackground()
            switch env.session {
            case .loading:
                ProgressView("Đang tải…")
                    .font(.roundedLabel(15))
            case .signedOut:
                SignInView()
            case .pending(let user):
                PendingApprovalView(user: user)
            case .disabled(let message):
                DisabledView(message: message)
            case .active:
                MainTabView()
            case .failed(let message):
                ContentUnavailableView {
                    Label("Không tải được dữ liệu", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Thử lại") { Task { await env.bootstrap() } }
                        .buttonStyle(.glassProminent)
                }
            }
        }
        // The in-app language: every `Text`/`LocalizedStringKey` below re-resolves against this
        // the moment the Account picker changes it — no relaunch (spec §D).
        .environment(\.locale, env.resolvedLocale)
        .animation(.smooth(duration: 0.3), value: env.session)
        .task { await env.bootstrap() }
    }
}
