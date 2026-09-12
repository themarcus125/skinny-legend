import Foundation
import Observation

/// Cursor-paginated group feed (`GET /feed`, 30 per page, newest `created_at` first).
@MainActor
@Observable
final class FeedModel {
    private let api: any APIClient
    private var nextCursor: String?

    private(set) var entries: [FeedEntryDTO] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    init(api: any APIClient) {
        self.api = api
    }

    var hasMore: Bool { nextCursor != nil }

    func loadFirstPage() async {
        nextCursor = nil
        entries = []
        await load(cursor: nil)
    }

    /// Called from the last visible row; loads one more page when that row is the current tail.
    func loadNextPageIfNeeded(after entry: FeedEntryDTO) async {
        guard let cursor = nextCursor, !isLoading, entry.id == entries.last?.id else { return }
        await load(cursor: cursor)
    }

    private func load(cursor: String?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let page = try await api.feed(cursor: cursor)
            let known = Set(entries.map(\.id))
            entries.append(contentsOf: page.entries.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = Localized.string("Không tải được nhật ký nhóm.")
        }
    }
}
