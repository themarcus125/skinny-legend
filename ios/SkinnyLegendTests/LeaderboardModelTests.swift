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

    /// The exact wording in each language is asserted in `LocalizedTests`; this only checks the
    /// language-neutral shape (the label reads the process-global in-app language).
    @Test("Announces the current member's row distinctly to VoiceOver")
    func accessibilityLabelMarksCurrentMember() {
        let user = UserSummary(id: "u1", displayName: "Khoa", avatarUrl: nil)
        let meRow = LeaderboardRow(rank: 1, user: user, total: 120, weekPoints: 30, isMe: true)
        let otherRow = LeaderboardRow(rank: 1, user: user, total: 120, weekPoints: 30, isMe: false)

        let meLabel = LeaderboardRowView.accessibilityLabel(for: meRow)
        let otherLabel = LeaderboardRowView.accessibilityLabel(for: otherRow)

        #expect(meLabel != otherLabel)
        #expect(meLabel.contains("Khoa") && meLabel.contains("120") && meLabel.contains("30"))
        #expect(otherLabel.contains("Khoa") && otherLabel.contains("120") && otherLabel.contains("30"))
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

        await model.loadNextPage()
        #expect(model.entries.count > 4)
        #expect(Set(model.entries.map(\.id)).count == model.entries.count)
    }

    /// The review's worry was a runaway: rows that lay out eagerly inside a nested `LazyVStack`
    /// each triggering a page, walking the whole history the moment the screen opens. The view
    /// side of the fix is the single footer trigger in the outer stack; this is the model side —
    /// one call advances by exactly one page and never cascades, and paging terminates.
    @Test("One call advances exactly one page and paging terminates")
    func paginationAdvancesOnePageAtATime() async throws {
        let client = MockAPIClient(historyPageSize: 4)
        let member = try #require(MockSeed.others.first)
        let model = MemberDetailModel(api: client, memberID: member.id)
        await model.loadFirstPage()
        #expect(model.entries.count == 4)

        await model.loadNextPage()
        #expect(model.entries.count > 4)
        #expect(model.entries.count <= 8)   // one page more, never a cascade

        // Paging to the very end terminates, and asking again once exhausted is a no-op.
        var guardRail = 0
        while model.hasMore && guardRail < 50 {
            await model.loadNextPage()
            guardRail += 1
        }
        #expect(model.hasMore == false)
        #expect(Set(model.entries.map(\.id)).count == model.entries.count)
        let exhausted = model.entries.count
        await model.loadNextPage()
        #expect(model.entries.count == exhausted)
    }
}
