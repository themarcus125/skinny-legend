import SwiftUI
import UIKit

enum AppTab: Hashable {
    case track
    case dashboard
    case leaderboard
    case trends
    case account
}

/// The five destinations from spec §7 on the iOS 26 glass tab bar. Four of them sit in the
/// capsule; "Ghi nhận" is a search-role tab, which the system renders as a separate circular
/// bubble on the trailing side (like Slack's "+"), kept brand-orange even when unselected.
/// The bar is pinned — it never minimises on scroll.
struct MainTabView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var selection: AppTab = .dashboard

    var body: some View {
        TabView(selection: $selection) {
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
                NavigationStack { AccountView(api: env.api) }
            }
            Tab(value: AppTab.track, role: .search) {
                NavigationStack { TrackView(api: env.api, placeSearch: env.placeSearch, locator: env.locator) }
            } label: {
                Label {
                    Text("Ghi nhận")
                } icon: {
                    Image(uiImage: TrackTabIcon.image)
                        .renderingMode(.original)
                }
            }
        }
        .tabBarMinimizeBehavior(.never)
        .tint(Theme.flame)
    }
}

/// A pre-tinted camera glyph so the Track bubble stays `Theme.flame` regardless of selection
/// (tab bars template-render plain symbols to grey when unselected).
enum TrackTabIcon {
    static let image: UIImage = {
        let configuration = UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
        let symbol = UIImage(systemName: "camera.fill", withConfiguration: configuration) ?? UIImage()
        return symbol.withTintColor(UIColor(Theme.flame), renderingMode: .alwaysOriginal)
    }()
}
