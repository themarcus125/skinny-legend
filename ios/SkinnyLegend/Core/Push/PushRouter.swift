import Foundation
import Observation

/// Reads the FCM `data` payload the notify job sends (`apps/api/src/jobs/notify.ts`).
/// Pure and nonisolated so the notification delegate can call it before hopping to the main actor.
enum PushPayload {
    static func tab(from userInfo: [AnyHashable: Any]) -> AppTab? {
        switch userInfo["deepLink"] as? String {
        case "track": .track
        default: nil
        }
    }
}

/// Everywhere the app can be opened to from outside: a tab, or the group map.
enum AppRoute: Hashable, Sendable {
    case tab(AppTab)
    /// The map is two pushes deep — Tổng quan → Nhật ký nhóm → Bản đồ — and those pushes are
    /// plain `NavigationLink`s with no `NavigationPath` to drive. So `.map` selects the
    /// Overview tab and raises `isMapRequested`; `DashboardView` turns that into the first
    /// push and `FeedView` consumes it for the second.
    case map
}

/// Carries a tapped notification's or quick action's destination from the app delegate to the tab bar.
/// A shared instance because `UIApplicationDelegate` is created by UIKit, outside the
/// SwiftUI environment; `MainTabView` observes it and consumes the request once.
@MainActor
@Observable
final class PushRouter {
    static let shared = PushRouter()

    private(set) var requestedTab: AppTab?

    /// Raised by the `.map` route only. Read by `DashboardView` (push the group feed) and
    /// cleared by `FeedView` (push the map) — see `AppRoute.map`.
    private(set) var isMapRequested = false

    func request(_ tab: AppTab) { requestedTab = tab }

    func open(_ route: AppRoute) {
        switch route {
        case .tab(let tab):
            isMapRequested = false
            request(tab)
        case .map:
            isMapRequested = true
            request(.dashboard)
        }
    }

    func handle(userInfo: [AnyHashable: Any]) {
        if let tab = PushPayload.tab(from: userInfo) { request(tab) }
    }

    /// Home Screen quick action. Returns whether the type was recognised, which is what the
    /// scene delegate reports back to UIKit.
    @discardableResult
    func handle(shortcutType: String) -> Bool {
        guard let route = AppShortcut.route(forType: shortcutType) else { return false }
        open(route)
        return true
    }

    /// Returns and clears the pending request, so switching tabs by hand is not undone.
    func consume() -> AppTab? {
        defer { requestedTab = nil }
        return requestedTab
    }

    /// Returns and clears the pending map request, so a later visit to the group feed does not
    /// push the map again.
    func consumeMap() -> Bool {
        defer { isMapRequested = false }
        return isMapRequested
    }
}
