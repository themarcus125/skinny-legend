import Testing
import Foundation
@testable import SkinnyLegend

@Suite("FeedModel")
@MainActor
struct FeedModelTests {
    @Test("Loads the first page of confirmed group entries")
    func loadsFirstPage() async {
        let model = FeedModel(api: MockAPIClient())
        await model.loadFirstPage()
        #expect(!model.entries.isEmpty)
        #expect(model.entries.allSatisfy { $0.status == .confirmed })
        #expect(model.errorMessage == nil)
        #expect(model.isLoading == false)
        // Newest first.
        #expect(model.entries == model.entries.sorted { $0.createdAt > $1.createdAt })
    }

    @Test("Appends the next page and never duplicates an entry")
    func paginates() async {
        let model = FeedModel(api: MockAPIClient())
        await model.loadFirstPage()
        let firstCount = model.entries.count
        guard let last = model.entries.last else {
            Issue.record("Expected a first page")
            return
        }
        await model.loadNextPageIfNeeded(after: last)
        #expect(model.entries.count >= firstCount)
        #expect(Set(model.entries.map(\.id)).count == model.entries.count)
    }

    @Test("Surfaces a load failure")
    func surfacesFailure() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let model = FeedModel(api: FailingClient(error: error))
        await model.loadFirstPage()
        #expect(model.entries.isEmpty)
        #expect(model.errorMessage == error.userMessage)
    }
}
