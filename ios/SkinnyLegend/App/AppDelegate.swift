import FirebaseMessaging
import OSLog
import UIKit
import UserNotifications

/// UIKit-side plumbing SwiftUI has no equivalent for: the APNs device token, the FCM token
/// refresh callback, and notification taps.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    private let log = Logger(subsystem: "com.themarcus125.skinnylegend", category: "push")

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set before returning so a tap that cold-launched the app is delivered to
        // `userNotificationCenter(_:didReceive:)` too (iOS 26 deprecated the launch-options key).
        UNUserNotificationCenter.current().delegate = self
        // Messaging touches FirebaseApp, which only exists on a live-backend launch.
        if AppMode.useLiveBackend { Messaging.messaging().delegate = self }
        // Cold launch from a Home Screen quick action. A scene-based app normally receives it
        // through `connectionOptions` in `SceneDelegate`; both paths call the same idempotent
        // router, so whichever the system uses, the app opens on the right screen once.
        if let shortcut = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem {
            PushRouter.shared.handle(shortcutType: shortcut.type)
        }
        return true
    }

    /// SwiftUI's `App` still owns the window; this only attaches `SceneDelegate` so the two
    /// scene callbacks quick actions arrive on are delivered (Apple's documented hook for
    /// scene events under `UIApplicationDelegateAdaptor`).
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // FCM cannot mint a token until it has the APNs one. The Simulator on Apple silicon
        // does hand out APNs tokens, so keep this behind the same gate as `configure()`.
        guard AppMode.useLiveBackend else { return }
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        log.error("APNs registration failed: \(error.localizedDescription, privacy: .public)")
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        // Resolve to a Sendable value here: `userInfo` is [AnyHashable: Any] and must not
        // cross the actor boundary under strict concurrency.
        let tab = PushPayload.tab(from: response.notification.request.content.userInfo)
        guard let tab else { return }
        await MainActor.run { PushRouter.shared.request(tab) }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}

extension AppDelegate: MessagingDelegate {
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        // The token can rotate at any time; re-register so the server never holds a stale one.
        Task { @MainActor in await PushTokenRefresh.shared.handle() }
    }
}

/// Bridges the FCM token-refresh callback to whichever `PushRegistrar` the app built.
@MainActor
final class PushTokenRefresh {
    static let shared = PushTokenRefresh()
    weak var registrar: PushRegistrar?

    /// The registrar decides whether the token is wanted (reminders ON, or a first registration
    /// still waiting on the APNs → FCM handshake); a rotated token must never undo `disable()`.
    func handle() async {
        await registrar?.handleTokenRefresh()
    }
}
