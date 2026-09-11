import Testing
import Foundation
@testable import SkinnyLegend

@Suite("DTO decoding")
struct DTODecodingTests {
    @Test("Decodes the user envelope with fractional-second dates")
    func decodesUser() throws {
        let user = try Fixture.decode(UserEnvelope.self, "user").user
        #expect(user.id == "11111111-1111-4111-8111-111111111111")
        #expect(user.firebaseUid == "firebase-uid-abc")
        #expect(user.displayName == "Khoa")
        #expect(user.avatarKey == "avatars/11111111-1111-4111-8111-111111111111/a1.jpg")
        #expect(user.role == .member)
        #expect(user.status == .active)
        #expect(user.createdAt.timeIntervalSince1970 == 1788833503.512)
    }

    @Test("Decodes POST /entries with its verdict, projection and caps")
    func decodesCreateEntry() throws {
        let response = try Fixture.decode(CreateEntryResponse.self, "entry_create")
        #expect(response.entry.status == .pending)
        #expect(response.entry.categories == [.exercise, .group])
        #expect(response.entry.localDate == "2026-09-11")
        #expect(response.entry.placeSource == .poi)
        #expect(response.entry.placeName == "Phòng gym California")
        #expect(response.verdict.healthy == nil)
        #expect(response.verdict.confidence == 0.82)
        #expect(response.verdict.failed == false)
        #expect(response.verdict.model == "qwen/qwen3.7-flash")
        #expect(response.projectedPoints == 6)
        #expect(response.capsHit[.exercise] == true)
        #expect(response.capsHit[.group] == false)
        #expect(response.capsHit.cappedSet == [.exercise])
        #expect(response.cappedCategories == [])
    }

    @Test("Decodes the history page, its per-entry points and its cursor")
    func decodesHistory() throws {
        let page = try Fixture.decode(HistoryPage.self, "history_page")
        #expect(page.entries.count == 2)
        #expect(page.entries[0].points == 6)
        #expect(page.entries[0].capped == false)
        #expect(page.entries[1].capped == true)
        #expect(page.entries[1].thumbUrl == nil)
        #expect(page.entries[1].placeName == nil)
        #expect(page.entries[1].placeSource == .none)
        #expect(page.nextCursor == "2026-09-10T11:05:00.000Z")
        #expect(page.entries[0].entry.id == "22222222-2222-4222-8222-222222222222")
    }

    @Test("Decodes the dashboard read model")
    func decodesDashboard() throws {
        let dashboard = try Fixture.decode(DashboardDTO.self, "dashboard")
        #expect(dashboard.today.points == 5)
        #expect(dashboard.today.categories == [.exercise, .meal])
        #expect(dashboard.yesterday.points == 3)
        #expect(dashboard.deltaVsYesterday == 2)
        #expect(dashboard.streak.current == 4)
        #expect(dashboard.streak.longest == 6)
        #expect(dashboard.streak.bonusPoints == 0)
        #expect(dashboard.rank == 2)
        #expect(dashboard.memberCount == 5)
        #expect(dashboard.remaining == [.group])
        #expect(dashboard.capsHit[.meal] == true)
    }

    @Test("Decodes the leaderboard envelope")
    func decodesLeaderboard() throws {
        let rows = try Fixture.decode(LeaderboardEnvelope.self, "leaderboard").leaderboard
        #expect(rows.count == 2)
        #expect(rows[0].rank == 1)
        #expect(rows[0].user.displayName == "Linh")
        #expect(rows[0].weekPoints == 14)
        #expect(rows[1].isMe)
        #expect(rows[1].user.avatarUrl == nil)
        #expect(rows[1].id == "11111111-1111-4111-8111-111111111111")
    }

    @Test("Decodes trends weeks, heatmap and category breakdown")
    func decodesTrends() throws {
        let trends = try Fixture.decode(TrendsDTO.self, "trends")
        #expect(trends.weeks.count == 2)
        #expect(trends.weeks[1].week == "2026-W38")
        #expect(trends.weeks[1].groupAvg == 12.0)
        #expect(trends.weeks[1].rank == 1)
        #expect(trends.heatmap.count == 3)
        #expect(trends.heatmap[1].points == 0)
        #expect(trends.byCategory[.exercise] == 21)
        #expect(trends.byCategory.total == 39)
        #expect(trends.streakBonus == 5)
    }

    @Test("Decodes a feed page with its embedded author")
    func decodesFeed() throws {
        let page = try Fixture.decode(FeedPage.self, "feed_page")
        #expect(page.entries.count == 1)
        #expect(page.entries[0].user.displayName == "Linh")
        #expect(page.entries[0].categories == [.meal])
        #expect(page.entries[0].placeName == "Cơm tấm Ba Ghiền")
        #expect(page.nextCursor == nil)
    }

    @Test("Encodes a create-entry body with an offset timestamp and omitted optionals")
    func encodesCreateEntry() throws {
        let takenAt = try Date("2026-09-11T01:30:00Z", strategy: .iso8601)
        let input = CreateEntryInput(photoKey: "photos/1111/abc.jpg", takenAt: takenAt, lat: nil, lng: nil, placeName: nil, placeSource: nil)
        let json = try #require(String(data: try JSONCoding.makeEncoder().encode(input), encoding: .utf8))
        #expect(json.contains("\"photoKey\":\"photos\\/1111\\/abc.jpg\"") || json.contains("\"photoKey\":\"photos/1111/abc.jpg\""))
        #expect(json.contains("2026-09-11T01:30:00"))
        #expect(!json.contains("lat"))
        #expect(!json.contains("placeName"))
    }

    @Test("Encodes a confirm body that clears the place with an explicit null")
    func encodesConfirmEntry() throws {
        let input = ConfirmEntryInput(categories: [.exercise], placeName: nil, placeSource: PlaceSource.none)
        let json = try #require(String(data: try JSONCoding.makeEncoder().encode(input), encoding: .utf8))
        #expect(json.contains("\"placeName\":null"))
        #expect(json.contains("\"placeSource\":\"none\""))
        #expect(json.contains("\"categories\":[\"exercise\"]"))
    }
}
