import Testing
import Foundation
@testable import SkinnyLegend

@Suite("AccountModel")
@MainActor
struct AccountModelTests {
    @Test("Groups history into day sections, newest day first")
    func groupsByDay() async {
        let model = AccountModel(api: MockAPIClient())
        await model.loadFirstPage()
        #expect(!model.sections.isEmpty)
        #expect(model.sections.map(\.date) == model.sections.map(\.date).sorted(by: >))
        for section in model.sections {
            #expect(section.entries.allSatisfy { $0.localDate == section.date })
            #expect(section.points == section.entries.reduce(0) { $0 + $1.points })
        }
        #expect(model.sections.flatMap(\.entries).count == model.entries.count)
    }

    @Test("Loads the profile summary from the leaderboard row flagged isMe")
    func loadsProfileSummary() async {
        let model = AccountModel(api: MockAPIClient())
        await model.loadFirstPage()
        #expect(model.profileSummary?.id == MockSeed.me.id)
    }

    @Test("Pages with the history cursor without duplicating entries")
    func paginates() async {
        let model = AccountModel(api: MockAPIClient(historyPageSize: 5))
        await model.loadFirstPage()
        #expect(model.entries.count == 5)
        guard let last = model.entries.last else {
            Issue.record("Expected a first page")
            return
        }
        await model.loadNextPageIfNeeded(after: last)
        #expect(model.entries.count > 5)
        #expect(Set(model.entries.map(\.id)).count == model.entries.count)
    }

    @Test("Deleting an entry removes it from the list")
    func deletes() async throws {
        let client = MockAPIClient()
        let model = AccountModel(api: client)
        await model.loadFirstPage()
        let victim = try #require(model.entries.first)
        await model.delete(victim)
        #expect(!model.entries.contains { $0.id == victim.id })
        #expect(model.errorMessage == nil)

        let fresh = try await client.myEntries(cursor: nil)
        #expect(!fresh.entries.contains { $0.id == victim.id })
    }

    @Test("Reloading after an edit picks up the new categories and points")
    func reloadsAfterEdit() async throws {
        let client = MockAPIClient()
        let model = AccountModel(api: client)
        await model.loadFirstPage()
        let target = try #require(model.entries.first { $0.categories != [.meal] })

        _ = try await client.confirmEntry(id: target.id, ConfirmEntryInput(categories: [.meal], placeName: nil, placeSource: PlaceSource.none))
        await model.reloadAfterEdit()

        let updated = try #require(model.entries.first { $0.id == target.id })
        #expect(updated.categories == [.meal])
        #expect(updated.placeName == nil)
    }

    @Test("Surfaces a load failure")
    func surfacesFailure() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let model = AccountModel(api: FailingClient(error: error))
        await model.loadFirstPage()
        #expect(model.entries.isEmpty)
        #expect(model.errorMessage == error.userMessage)
    }

    // MARK: - Ruling 1: loadProfile() must not swallow errors with `try?`

    @Test("Surfaces a profile load failure while keeping the successfully loaded history")
    func surfacesProfileFailureButKeepsHistory() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let client = LeaderboardFailingClient(error: error)
        let model = AccountModel(api: client)
        await model.loadFirstPage()
        #expect(!model.entries.isEmpty)
        #expect(model.profileSummary == nil)
        #expect(model.errorMessage == error.userMessage)
    }
}

/// Forwards every call to a real `MockAPIClient` except `leaderboard()`, which always fails —
/// so `AccountModel.loadProfile()`'s error path can be exercised without also breaking history
/// loading (ruling 1: `loadProfile()` must surface its own failure, not swallow it with `try?`).
struct LeaderboardFailingClient: APIClient {
    let inner: MockAPIClient
    let error: APIError

    init(error: APIError, today: LocalDate = LocalDay.today) {
        self.error = error
        self.inner = MockAPIClient(today: today)
    }

    func session() async throws -> UserDTO { try await inner.session() }
    func me() async throws -> UserDTO { try await inner.me() }
    func updateMe(displayName: String?, avatarKey: String?) async throws -> UserDTO {
        try await inner.updateMe(displayName: displayName, avatarKey: avatarKey)
    }
    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO {
        try await inner.presign(kind: kind, contentType: contentType)
    }
    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws {
        try await inner.upload(data, to: presign, contentType: contentType, onProgress: onProgress)
    }
    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse { try await inner.createEntry(input) }
    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse {
        try await inner.confirmEntry(id: id, input)
    }
    func deleteEntry(id: String) async throws { try await inner.deleteEntry(id: id) }
    func myEntries(cursor: String?) async throws -> HistoryPage { try await inner.myEntries(cursor: cursor) }
    func dashboard() async throws -> DashboardDTO { try await inner.dashboard() }
    func leaderboard() async throws -> [LeaderboardRow] { throw error }
    func trends() async throws -> TrendsDTO { try await inner.trends() }
    func feed(cursor: String?) async throws -> FeedPage { try await inner.feed(cursor: cursor) }
    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage {
        try await inner.entries(ofUser: userID, cursor: cursor)
    }
    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws {
        try await inner.sendFeedback(message: message, screenshotKey: screenshotKey, appVersion: appVersion)
    }
}
