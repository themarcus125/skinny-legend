import FirebaseMessaging
import UIKit
import UserNotifications

/// The system permission surface, behind a protocol so `PushRegistrar` is testable without a
/// real `UNUserNotificationCenter` (which needs a full app host to answer).
@MainActor
protocol PushAuthorizing {
    func authorizationStatus() async -> UNAuthorizationStatus
    /// Shows the system prompt. Returns whether the user allowed notifications.
    func requestAuthorization() async throws -> Bool
    func registerForRemoteNotifications() async
}

/// Source of the FCM registration token.
@MainActor
protocol PushTokenSource {
    func currentToken() async throws -> String?
}

@MainActor
struct SystemPushAuthorizer: PushAuthorizing {
    func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    func requestAuthorization() async throws -> Bool {
        try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
    }

    func registerForRemoteNotifications() async {
        UIApplication.shared.registerForRemoteNotifications()
    }
}

/// Real FCM token. Only constructed when Firebase has been configured (`AppMode.useLiveBackend`).
@MainActor
struct FirebaseTokenSource: PushTokenSource {
    /// Firebase 12.18 deprecated every registration-token API in favour of FID-based
    /// registration (`register(completion:)`), which is opt-in via
    /// `FirebaseMessagingInstallationIdEnabled` and hands the server an Installation ID, not a
    /// token — and errors outright while that flag is unset. The API sends by token
    /// (`sendEach({ token })` in apps/api/src/services/push.ts), so the classic token stays the
    /// contract. Marking this witness deprecated silences the SDK deprecation inside it; every
    /// caller reaches it through `any PushTokenSource`, which is not deprecated.
    @available(*, deprecated, message: "Wraps Firebase's deprecated registration-token API on purpose; see the doc comment.")
    func currentToken() async throws -> String? {
        try await Messaging.messaging().token()
    }
}
