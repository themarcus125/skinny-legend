import Foundation
import Observation

@MainActor
@Observable
final class AccountModel {
    struct DaySection: Identifiable, Hashable {
        let date: LocalDate
        let entries: [HistoryEntryDTO]

        var id: LocalDate { date }
        var points: Int { entries.reduce(0) { $0 + $1.points } }
    }

    private let api: any APIClient
    private var nextCursor: String?

    private(set) var entries: [HistoryEntryDTO] = []
    /// `/me` exposes the avatar as a storage key; the read models expose it as a URL, so the
    /// header reads the URL (plus rank and total) from the leaderboard row flagged `isMe`.
    private(set) var profileSummary: UserSummary?
    private(set) var myRank: Int?
    private(set) var myTotal: Int?
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    init(api: any APIClient) {
        self.api = api
    }

    var hasMore: Bool { nextCursor != nil }

    /// VoiceOver label for a combined `HistoryRow` (ios-accessibility skill: group related
    /// content, then describe it in one sentence instead of leaving each child as its own
    /// swipe stop). Pure so it can be unit tested without a view.
    static func accessibilityLabel(for entry: HistoryEntryDTO) -> String {
        let day = LocalDay.display(entry.localDate)
        let categories = entry.categories.isEmpty
            ? "Chưa chọn hạng mục"
            : entry.categories.map(\.label).joined(separator: ", ")
        let place = entry.placeName ?? "không có địa điểm"
        var label = "\(day), \(categories), \(place), \(entry.points) điểm"
        if entry.capped {
            label += ", đã đủ giới hạn"
        }
        return label
    }

    var sections: [DaySection] {
        Dictionary(grouping: entries, by: \.localDate)
            .map { DaySection(date: $0.key, entries: $0.value.sorted { $0.takenAt > $1.takenAt }) }
            .sorted { $0.date > $1.date }
    }

    /// History loads before the profile so a profile failure's `errorMessage` (ruling 1) is not
    /// immediately clobbered by a subsequent successful `load(cursor:)`, which resets it to nil.
    func loadFirstPage() async {
        nextCursor = nil
        entries = []
        await load(cursor: nil)
        await loadProfile()
    }

    func loadNextPageIfNeeded(after entry: HistoryEntryDTO) async {
        guard let cursor = nextCursor, !isLoading, entry.id == entries.last?.id else { return }
        await load(cursor: cursor)
    }

    /// Editing an entry can change scoring for every other entry in the same day/week, so the
    /// whole first page is refetched rather than patched in place.
    func reloadAfterEdit() async {
        nextCursor = nil
        entries = []
        await load(cursor: nil)
        await loadProfile()
    }

    /// `DELETE /entries/:id` soft-deletes by setting `rejected` (spec §6).
    func delete(_ entry: HistoryEntryDTO) async {
        errorMessage = nil
        do {
            try await api.deleteEntry(id: entry.id)
            entries.removeAll { $0.id == entry.id }
            await loadProfile()
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = "Không xoá được, hãy thử lại."
        }
    }

    /// Ruling 1: must not swallow errors with `try?` — a failure here has to surface exactly like
    /// `load(cursor:)`'s, and whatever profile data was already loaded must be left in place.
    private func loadProfile() async {
        do {
            guard let row = try await api.leaderboard().first(where: \.isMe) else { return }
            profileSummary = row.user
            myRank = row.rank
            myTotal = row.total
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = "Không tải được hồ sơ."
        }
    }

    private func load(cursor: String?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let page = try await api.myEntries(cursor: cursor)
            let known = Set(entries.map(\.id))
            entries.append(contentsOf: page.entries.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = "Không tải được lịch sử."
        }
    }
}
