import Foundation
import Observation

/// The rows behind one heatmap square. `GET /entries/mine` is a newest-first cursor feed, so
/// pages are pulled until one reaches past the target day (bounded, so a deep history cannot
/// turn a tap into an unbounded fetch).
@MainActor
@Observable
final class DayEntriesModel {
    private static let maxPages = 5

    private let api: any APIClient
    let date: LocalDate

    private(set) var entries: [HistoryEntryDTO] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    init(api: any APIClient, date: LocalDate) {
        self.api = api
        self.date = date
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        var cursor: String?
        var found: [HistoryEntryDTO] = []
        do {
            for _ in 0..<Self.maxPages {
                let page = try await api.myEntries(cursor: cursor)
                found.append(contentsOf: page.entries.filter { $0.localDate == date })
                if let last = page.entries.last, last.localDate < date { break }
                guard let next = page.nextCursor else { break }
                cursor = next
            }
            entries = found
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = "Không tải được hoạt động của ngày này."
        }
    }
}
