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
}

/// Fails every read so error paths can be exercised. Shared by the read-model suites.
struct FailingClient: APIClient {
    let error: APIError

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
}
