import Testing
import Foundation
@testable import SkinnyLegend

/// Every `MockAPIClient` here is seeded with a frozen `today` (spec-window "2026-09-11") so the
/// suite is hermetic and doesn't depend on the wall clock (Task 2 controller ruling).
private let frozenToday: LocalDate = "2026-09-11"

@Suite("MockAPIClient")
struct MockAPIClientTests {
    @Test("Registering and unregistering a device round-trips")
    func devices() async throws {
        let client = MockAPIClient()
        try await client.registerDevice(token: "t1", platform: .ios, locale: .vi)
        try await client.registerDevice(token: "t2", platform: .ios, locale: .en)
        #expect(await client.registeredTokens() == ["t1", "t2"])
        try await client.unregisterDevice(token: "t1")
        #expect(await client.registeredTokens() == ["t2"])
    }

    @Test("Seeds every screen with data")
    func seeds() async throws {
        let client = MockAPIClient(today: frozenToday)
        let board = try await client.leaderboard()
        #expect(board.count == 5)
        #expect(board.contains { $0.isMe })
        #expect(board.map(\.rank) == board.map(\.rank).sorted())

        let dashboard = try await client.dashboard()
        #expect(dashboard.memberCount == 5)
        #expect(dashboard.total > 0)

        let feed = try await client.feed(cursor: nil)
        #expect(feed.entries.count > 5)
        #expect(feed.entries.allSatisfy { $0.status == .confirmed })

        let history = try await client.myEntries(cursor: nil)
        #expect(history.entries.count > 5)

        let trends = try await client.trends()
        #expect(!trends.weeks.isEmpty)
        #expect(!trends.heatmap.isEmpty)
    }

    @Test("Create, confirm and delete round-trip through the in-memory store")
    func entryLifecycle() async throws {
        let client = MockAPIClient(today: frozenToday)
        let before = try await client.dashboard().total

        let presign = try await client.presign(kind: .photo, contentType: "image/jpeg")
        try await client.upload(Data([0xFF, 0xD8, 0xFF]), to: presign, contentType: "image/jpeg", onProgress: { _ in })

        let takenAt = LocalDay.date(from: frozenToday)!
        let created = try await client.createEntry(
            CreateEntryInput(photoKey: presign.key, takenAt: takenAt, lat: 10.7769, lng: 106.7009, placeName: "Sân cầu lông Tân Bình", placeSource: .poi)
        )
        // A usable verdict confirms the entry outright, so it already scores before any PATCH.
        #expect(created.verdict.failed == false)
        #expect(created.entry.status == .confirmed)
        #expect(!created.verdict.categories.isEmpty)
        #expect(created.entry.categories == created.verdict.categories)
        // Already visible everywhere a confirmed entry is (the seed may have this day's meal cap
        // filled already, so the total is only guaranteed not to drop).
        #expect(try await client.dashboard().total >= before)
        #expect(try await client.feed(cursor: nil).entries.contains { $0.id == created.entry.id })
        #expect(try await client.myEntries(cursor: nil).entries.first { $0.id == created.entry.id }?.status == .confirmed)

        let confirmed = try await client.confirmEntry(
            id: created.entry.id,
            ConfirmEntryInput(categories: [.group], placeName: "Sân cầu lông Tân Bình", placeSource: .poi)
        )
        #expect(confirmed.entry.status == .confirmed)
        #expect(confirmed.entry.categories == [.group])
        #expect(try await client.dashboard().total >= before)

        try await client.deleteEntry(id: created.entry.id)
        let history = try await client.myEntries(cursor: nil)
        #expect(!history.entries.contains { $0.id == created.entry.id })
        #expect(try await client.dashboard().total == before)
    }

    @Test("A failed verdict leaves the entry pending with no categories until it is confirmed by hand")
    func failedVerdictStaysPending() async throws {
        let client = MockAPIClient(today: frozenToday)
        let takenAt = LocalDay.date(from: frozenToday)!
        var failed: CreateEntryResponse?
        for _ in 0..<8 {
            let created = try await client.createEntry(
                CreateEntryInput(photoKey: "photos/x.jpg", takenAt: takenAt, lat: nil, lng: nil, placeName: nil, placeSource: nil)
            )
            if created.verdict.failed { failed = created; break }
            #expect(created.entry.status == .confirmed)
        }
        let created = try #require(failed)
        #expect(created.entry.status == .pending)
        #expect(created.entry.categories.isEmpty)
        #expect(created.verdict.categories.isEmpty)
        #expect(created.projectedPoints == 0)
        #expect(try await client.feed(cursor: nil).entries.contains { $0.id == created.entry.id } == false)

        let confirmed = try await client.confirmEntry(
            id: created.entry.id, ConfirmEntryInput(categories: [.meal], placeName: nil, placeSource: PlaceSource.none)
        )
        #expect(confirmed.entry.status == .confirmed)
        #expect(confirmed.entry.categories == [.meal])
        #expect(try await client.feed(cursor: nil).entries.contains { $0.id == created.entry.id })
    }

    @Test("Paginates history with a cursor")
    func paginates() async throws {
        let client = MockAPIClient(historyPageSize: 4, today: frozenToday)
        let first = try await client.myEntries(cursor: nil)
        #expect(first.entries.count == 4)
        let cursor = try #require(first.nextCursor)
        let second = try await client.myEntries(cursor: cursor)
        #expect(!second.entries.isEmpty)
        #expect(Set(second.entries.map(\.id)).isDisjoint(with: Set(first.entries.map(\.id))))
    }

    @Test("Updating the profile is visible on the next read")
    func updatesProfile() async throws {
        let client = MockAPIClient(today: frozenToday)
        let updated = try await client.updateMe(displayName: "Khoa Legend", avatarKey: nil)
        #expect(updated.displayName == "Khoa Legend")
        #expect(try await client.me().displayName == "Khoa Legend")
    }
}
