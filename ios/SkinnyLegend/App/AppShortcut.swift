import Foundation

/// The static Home Screen quick actions (long-press the app icon) declared as
/// `UIApplicationShortcutItems` in `ios/project.yml`. The types live here as well so the
/// Info.plist list and the routing table cannot drift apart; the titles stay in the plist,
/// localised through `InfoPlist.xcstrings`.
enum AppShortcut: String, CaseIterable, Sendable {
    case track = "com.themarcus125.skinnylegend.track"
    case leaderboard = "com.themarcus125.skinnylegend.leaderboard"
    case trends = "com.themarcus125.skinnylegend.trends"
    case map = "com.themarcus125.skinnylegend.map"

    var route: AppRoute {
        switch self {
        case .track: .tab(.track)
        case .leaderboard: .tab(.leaderboard)
        case .trends: .tab(.trends)
        case .map: .map
        }
    }

    /// `nil` for a type this build does not know — the Home Screen caches quick actions, so an
    /// older shortcut can outlive the plist entry that created it and must be ignored.
    static func route(forType type: String) -> AppRoute? {
        AppShortcut(rawValue: type)?.route
    }
}
