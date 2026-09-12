import Testing
import Foundation
@testable import SkinnyLegend

@Suite("Leaderboard")
@MainActor
struct LeaderboardModelTests {
    @Test("Loads a ranked board that marks the current member")
    func loadsBoard() async {
        let model = LeaderboardModel(api: MockAPIClient())
        await model.load()
        guard case .loaded(let rows) = model.state else {
            Issue.record("Expected .loaded, got \(model.state)")
            return
        }
        #expect(rows.count == 5)
        #expect(rows.filter(\.isMe).count == 1)
        #expect(rows.map(\.total) == rows.map(\.total).sorted(by: >))
        #expect(rows.first?.rank == 1)
    }

    @Test("Surfaces a load failure")
    func surfacesFailure() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let model = LeaderboardModel(api: FailingClient(error: error))
        await model.load()
        #expect(model.state == .failed(error.userMessage))
    }

    @Test("Member detail pages a member's confirmed entries")
    func memberDetailPages() async throws {
        let client = MockAPIClient(historyPageSize: 4)
        let member = try #require(MockSeed.others.first)
        let model = MemberDetailModel(api: client, memberID: member.id)
        await model.loadFirstPage()
        #expect(model.entries.count == 4)
        #expect(model.entries.allSatisfy { $0.userId == member.id && $0.status == .confirmed })

        guard let last = model.entries.last else {
            Issue.record("Expected a first page")
            return
        }
        await model.loadNextPageIfNeeded(after: last)
        #expect(model.entries.count > 4)
        #expect(Set(model.entries.map(\.id)).count == model.entries.count)
    }
}
