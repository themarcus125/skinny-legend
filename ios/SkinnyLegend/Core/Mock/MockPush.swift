import Foundation
import UserNotifications

/// Records what the registrar asked for, and answers with whatever the test configured.
@MainActor
final class MockPushAuthorizer: PushAuthorizing {
    var status: UNAuthorizationStatus
    var grant: Bool
    private(set) var requestCount = 0
    private(set) var didRegisterForRemote = false

    init(status: UNAuthorizationStatus = .notDetermined, grant: Bool = true) {
        self.status = status
        self.grant = grant
    }

    func authorizationStatus() async -> UNAuthorizationStatus { status }

    func requestAuthorization() async throws -> Bool {
        requestCount += 1
        status = grant ? .authorized : .denied
        return grant
    }

    func registerForRemoteNotifications() async { didRegisterForRemote = true }
}

/// A fixed token, so the Simulator can exercise the whole registration flow with no APNs key.
@MainActor
struct MockPushTokenSource: PushTokenSource {
    var token: String? = "mock-fcm-token"
    func currentToken() async throws -> String? { token }
}
