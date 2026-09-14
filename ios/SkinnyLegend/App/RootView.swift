import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        ZStack {
            AppBackground()
            switch env.session {
            case .loading:
                ProgressView("Đang tải…")
                    .typeStyle(.bodyMedium)
                    .tint(Theme.primary)
                    .foregroundStyle(Theme.fgMuted)
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
                        .buttonStyle(.ds(.primary, size: .md))
                }
                .emptyStateStyle()
            }
        }
        // The in-app language: every `Text`/`LocalizedStringKey` below re-resolves against this
        // the moment the Account picker changes it — no relaunch (spec §D).
        .environment(\.locale, env.resolvedLocale)
        .animation(.smooth(duration: 0.3), value: env.session)
        // Keyed on the environment's identity, not just on appearance: leaving or entering the
        // DEBUG sample-data mode swaps the whole `AppEnvironment` under this view, and the new
        // one starts at `.loading` with nothing having bootstrapped it.
        .task(id: ObjectIdentifier(env)) { await env.bootstrap() }
    }
}
