import Testing
import Foundation
@testable import SkinnyLegend

/// A client that fails `session()` in a controlled way, so the environment's state machine can be
/// tested without touching Firebase or the network.
private struct StubAPIClient: APIClient {
    var sessionResult: Result<UserDTO, APIError>

    func session() async throws -> UserDTO { try sessionResult.get() }
    func me() async throws -> UserDTO { try sessionResult.get() }
    func updateMe(displayName: String?, avatarKey: String?) async throws -> UserDTO { try sessionResult.get() }
    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO { throw APIError.malformedResponse }
    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws {}
    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse { throw APIError.malformedResponse }
    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse { throw APIError.malformedResponse }
    func deleteEntry(id: String) async throws {}
    func myEntries(cursor: String?) async throws -> HistoryPage { HistoryPage(entries: [], nextCursor: nil) }
    func dashboard() async throws -> DashboardDTO { throw APIError.malformedResponse }
    func leaderboard() async throws -> [LeaderboardRow] { [] }
    func trends() async throws -> TrendsDTO { throw APIError.malformedResponse }
    func feed(cursor: String?) async throws -> FeedPage { FeedPage(entries: [], nextCursor: nil) }
    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage { EntryPage(entries: [], nextCursor: nil) }
    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws {}
}

private func pendingUser() -> UserDTO {
    UserDTO(id: "u1", firebaseUid: "f1", displayName: "Khoa", avatarKey: nil, role: .member, status: .pending, createdAt: Date())
}

private func activeUser() -> UserDTO {
    UserDTO(id: "u1", firebaseUid: "f1", displayName: "Khoa", avatarKey: nil, role: .member, status: .active, createdAt: Date())
}

private func disabledUser() -> UserDTO {
    UserDTO(id: "u1", firebaseUid: "f1", displayName: "Khoa", avatarKey: nil, role: .member, status: .disabled, createdAt: Date())
}

@Suite("AppEnvironment")
@MainActor
struct AppEnvironmentTests {
    @Test("A signed-out auth service leaves the app on the sign-in screen")
    func signedOut() async {
        let auth = MockAuthService(startSignedIn: false)
        let env = AppEnvironment(api: MockAPIClient(), auth: auth)
        await env.bootstrap()
        #expect(env.session == .signedOut)
    }

    @Test("An active member lands on the tabs")
    func activeMember() async {
        let env = AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        #expect(env.currentUser?.status == .active)
        if case .active = env.session {} else { Issue.record("Expected .active, got \(env.session)") }
    }

    @Test("A session response with status active routes to the active state")
    func sessionStatusActiveRoutesToActive() async {
        let env = AppEnvironment(api: StubAPIClient(sessionResult: .success(activeUser())), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        if case .active(let user) = env.session {
            #expect(user.status == .active)
        } else {
            Issue.record("Expected .active, got \(env.session)")
        }
    }

    @Test("A pending member sees the waiting-for-approval state")
    func pendingMember() async {
        let env = AppEnvironment(api: StubAPIClient(sessionResult: .success(pendingUser())), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        if case .pending(let user) = env.session {
            #expect(user.status == .pending)
        } else {
            Issue.record("Expected .pending, got \(env.session)")
        }
    }

    @Test("A disabled member (status in the session body) sees a sign-out screen, not the tabs")
    func disabledMember() async {
        let env = AppEnvironment(api: StubAPIClient(sessionResult: .success(disabledUser())), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        if case .disabled(let message) = env.session {
            #expect(message.isEmpty == false)
        } else {
            Issue.record("Expected .disabled, got \(env.session)")
        }
    }

    @Test("A 403 disabled from the API (the real shape: authenticate rejects before a body) also routes to disabled")
    func disabledFromAPIError() async {
        let error = APIError(status: 403, code: "disabled", message: "Account disabled")
        let env = AppEnvironment(api: StubAPIClient(sessionResult: .failure(error)), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        if case .disabled(let message) = env.session {
            #expect(message.isEmpty == false)
        } else {
            Issue.record("Expected .disabled, got \(env.session)")
        }
    }

    @Test("Signing out from the disabled state returns to signed-out")
    func signOutFromDisabled() async {
        let error = APIError(status: 403, code: "disabled", message: "Account disabled")
        let env = AppEnvironment(api: StubAPIClient(sessionResult: .failure(error)), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        env.signOut()
        #expect(env.session == .signedOut)
        #expect(env.currentUser == nil)
    }

    @Test("A network failure surfaces a retryable error state")
    func networkFailure() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let env = AppEnvironment(api: StubAPIClient(sessionResult: .failure(error)), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        if case .failed(let message) = env.session {
            #expect(message == error.userMessage)
        } else {
            Issue.record("Expected .failed, got \(env.session)")
        }
    }

    @Test("A 403 pending_approval error is surfaced as a generic failure")
    func pendingApprovalErrorSurfacesAsFailure() async {
        let error = APIError(status: 403, code: "pending_approval", message: "Account awaiting admin approval")
        let env = AppEnvironment(api: StubAPIClient(sessionResult: .failure(error)), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        if case .failed(let message) = env.session {
            #expect(message == error.userMessage)
        } else {
            Issue.record("Expected .failed, got \(env.session)")
        }
    }

    @Test("A 401 signs the user out rather than showing an error")
    func unauthenticatedSignsOut() async {
        let env = AppEnvironment(api: StubAPIClient(sessionResult: .failure(APIError.unauthenticated)), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        #expect(env.session == .signedOut)
    }

    @Test("Signing out clears the session")
    func signOut() async {
        let env = AppEnvironment(api: MockAPIClient(), auth: MockAuthService(startSignedIn: true))
        await env.bootstrap()
        env.signOut()
        #expect(env.session == .signedOut)
        #expect(env.currentUser == nil)
    }
}

/// `AppMode.useLiveBackend` reads `ProcessInfo`/`Bundle` directly, so the branching decision is
/// pulled into a pure function here — this is what a launch with neither `-mockAPI` nor a
/// `GoogleService-Info.plist` must resolve to `false` for, so `AppEnvironment.make()` falls back
/// to the mock services instead of constructing a `FirebaseAuthService` that talks to an
/// unconfigured `FirebaseApp` and crashes.
@Suite("AppMode")
struct AppModeTests {
    @Test("Mock mode wins even when a Firebase plist is present")
    func mockWinsOverPlist() {
        #expect(AppMode.servicesAreLive(isMock: true, hasFirebasePlist: true) == false)
    }

    @Test("Mock mode with no plist stays mock")
    func mockWithNoPlist() {
        #expect(AppMode.servicesAreLive(isMock: true, hasFirebasePlist: false) == false)
    }

    @Test("Live mode requires both: not mock and a Firebase plist present")
    func liveRequiresPlist() {
        #expect(AppMode.servicesAreLive(isMock: false, hasFirebasePlist: true) == true)
    }

    @Test("Not mock but no Firebase plist still falls back to mock, rather than crashing on an unconfigured FirebaseApp")
    func noFlagNoPlistFallsBackToMock() {
        #expect(AppMode.servicesAreLive(isMock: false, hasFirebasePlist: false) == false)
    }
}
