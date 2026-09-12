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

/// Carries a tapped notification's destination from the app delegate to the tab bar.
/// A shared instance because `UIApplicationDelegate` is created by UIKit, outside the
/// SwiftUI environment; `MainTabView` observes it and consumes the request once.
@MainActor
@Observable
final class PushRouter {
    static let shared = PushRouter()

    private(set) var requestedTab: AppTab?

    func request(_ tab: AppTab) { requestedTab = tab }

    func handle(userInfo: [AnyHashable: Any]) {
        if let tab = PushPayload.tab(from: userInfo) { request(tab) }
    }

    /// Returns and clears the pending request, so switching tabs by hand is not undone.
    func consume() -> AppTab? {
        defer { requestedTab = nil }
        return requestedTab
    }
}
