import Foundation
import Observation

/// `GET /users/:id/entries` — another member's confirmed entries, cursor-paginated.
@MainActor
@Observable
final class MemberDetailModel {
    private let api: any APIClient
    private let memberID: String
    private var nextCursor: String?

    private(set) var entries: [EntryDTO] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    init(api: any APIClient, memberID: String) {
        self.api = api
        self.memberID = memberID
    }

    var hasMore: Bool { nextCursor != nil }

    func loadFirstPage() async {
        nextCursor = nil
        entries = []
        await load(cursor: nil)
    }

    func loadNextPageIfNeeded(after entry: EntryDTO) async {
        guard let cursor = nextCursor, !isLoading, entry.id == entries.last?.id else { return }
        await load(cursor: cursor)
    }

    private func load(cursor: String?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let page = try await api.entries(ofUser: memberID, cursor: cursor)
            let known = Set(entries.map(\.id))
            entries.append(contentsOf: page.entries.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = "Không tải được hoạt động của thành viên."
        }
    }
}
