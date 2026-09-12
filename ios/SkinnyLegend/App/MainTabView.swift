import SwiftUI

enum AppTab: Hashable {
    case track
    case dashboard
    case leaderboard
    case trends
    case account
}

/// The five tabs from spec §7, on the iOS 26 glass tab bar that minimises as content scrolls.
struct MainTabView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var selection: AppTab = .dashboard

    var body: some View {
        TabView(selection: $selection) {
            Tab("Ghi nhận", systemImage: "camera.fill", value: AppTab.track) {
                NavigationStack { TrackView(api: env.api, placeSearch: env.placeSearch, locator: env.locator) }
            }
            Tab("Tổng quan", systemImage: "flame.fill", value: AppTab.dashboard) {
                NavigationStack { DashboardView(api: env.api) }
            }
            Tab("Xếp hạng", systemImage: "trophy.fill", value: AppTab.leaderboard) {
                NavigationStack { LeaderboardView(api: env.api) }
            }
            Tab("Xu hướng", systemImage: "chart.bar.xaxis", value: AppTab.trends) {
                NavigationStack { TrendsView(api: env.api) }
            }
            Tab("Tài khoản", systemImage: "person.crop.circle", value: AppTab.account) {
                NavigationStack { TabStub(title: "Tài khoản", symbol: "person.crop.circle") }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tint(Theme.flame)
    }
}

/// Temporary tab content. Each feature task replaces exactly one `TabStub(...)` call above with
/// its real view; the last feature task (Task 13) deletes this type.
struct TabStub: View {
    let title: String
    let symbol: String

    var body: some View {
        ZStack {
            WarmBackground()
            ContentUnavailableView("Chưa có dữ liệu", systemImage: symbol, description: Text("Màn hình đang được xây dựng."))
        }
        .navigationTitle(title)
    }
}
