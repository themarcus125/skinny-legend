import Testing
import Foundation
@testable import SkinnyLegend

@Suite("DashboardModel")
@MainActor
struct DashboardModelTests {
    @Test("Loads the dashboard read model")
    func loads() async throws {
        let model = DashboardModel(api: MockAPIClient())
        #expect(model.state == .loading)
        await model.load()
        guard case .loaded(let dashboard) = model.state else {
            Issue.record("Expected .loaded, got \(model.state)")
            return
        }
        #expect(dashboard.memberCount == 5)
        #expect(dashboard.rank >= 1 && dashboard.rank <= 5)
        #expect(dashboard.deltaVsYesterday == dashboard.today.points - dashboard.yesterday.points)
        #expect(dashboard.remaining.allSatisfy { !dashboard.capsHit[$0] })
    }

    @Test("Surfaces a failure with the Vietnamese message")
    func surfacesFailure() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let model = DashboardModel(api: FailingClient(error: error))
        await model.load()
        #expect(model.state == .failed(error.userMessage))
    }

    @Test("A second concurrent load() does not issue a second request")
    func guardsAgainstConcurrentLoad() async {
        let client = SlowDashboardClient()
        let model = DashboardModel(api: client)

        async let first: Void = model.load()
        async let second: Void = model.load()
        _ = await (first, second)

        let callCount = await client.dashboardCallCount
        #expect(callCount == 1)
        #expect(model.state != .loading)
    }
}

/// Answers `dashboard()` only after a short delay, so two `load()` calls can race without a
/// real network. Counts how many requests actually went out.
actor SlowDashboardClient: APIClient {
    private(set) var dashboardCallCount = 0

    func session() async throws -> UserDTO { fatalError("unused in this test") }
    func me() async throws -> UserDTO { fatalError("unused in this test") }
    func updateMe(displayName: String?, avatarKey: String?) async throws -> UserDTO { fatalError("unused in this test") }
    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO { fatalError("unused in this test") }
    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws { fatalError("unused in this test") }
    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse { fatalError("unused in this test") }
    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse { fatalError("unused in this test") }
    func deleteEntry(id: String) async throws { fatalError("unused in this test") }
    func myEntries(cursor: String?) async throws -> HistoryPage { fatalError("unused in this test") }
    func leaderboard() async throws -> [LeaderboardRow] { fatalError("unused in this test") }
    func trends() async throws -> TrendsDTO { fatalError("unused in this test") }
    func feed(cursor: String?) async throws -> FeedPage { fatalError("unused in this test") }
    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage { fatalError("unused in this test") }
    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws { fatalError("unused in this test") }
    func mapPins(days: Int) async throws -> MapPinsPage { fatalError("unused in this test") }

    func dashboard() async throws -> DashboardDTO {
        dashboardCallCount += 1
        try? await Task.sleep(nanoseconds: 100_000_000)
        return DashboardDTO(
            today: DayPoints(points: 10, categories: []),
            yesterday: YesterdayPoints(points: 5),
            deltaVsYesterday: 5,
            streak: StreakDTO(current: 1, longest: 1, bonusesAwarded: 0, bonusPoints: 0),
            total: 10,
            rank: 1,
            memberCount: 1,
            capsHit: .none,
            remaining: Category.allCases
        )
    }
}

/// Fails every call so error paths can be exercised. Shared by the read-model suites; pass an
/// `APIError` to hit the `userMessage` path or any other error to hit a model's own fallback copy.
struct FailingClient: APIClient {
    let error: any Error

    func session() async throws -> UserDTO { throw error }
    func me() async throws -> UserDTO { throw error }
    func updateMe(displayName: String?, avatarKey: String?) async throws -> UserDTO { throw error }
    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO { throw error }
    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws { throw error }
    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse { throw error }
    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse { throw error }
    func deleteEntry(id: String) async throws { throw error }
    func myEntries(cursor: String?) async throws -> HistoryPage { throw error }
    func dashboard() async throws -> DashboardDTO { throw error }
    func leaderboard() async throws -> [LeaderboardRow] { throw error }
    func trends() async throws -> TrendsDTO { throw error }
    func feed(cursor: String?) async throws -> FeedPage { throw error }
    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage { throw error }
    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws { throw error }
    func mapPins(days: Int) async throws -> MapPinsPage { throw error }
}
