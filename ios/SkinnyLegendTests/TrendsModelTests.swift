import Testing
import Foundation
@testable import SkinnyLegend

@Suite("TrendsModel")
@MainActor
struct TrendsModelTests {
    @Test("Loads weeks, heatmap and category breakdown")
    func loads() async {
        let model = TrendsModel(api: MockAPIClient())
        await model.load()
        guard case .loaded(let trends) = model.state else {
            Issue.record("Expected .loaded, got \(model.state)")
            return
        }
        #expect(!trends.weeks.isEmpty)
        #expect(trends.weeks.count <= 8)
        #expect(trends.byCategory.total >= 0)
        #expect(trends.weeks.allSatisfy { $0.rank >= 1 })
    }

    @Test("Builds a Monday-aligned heatmap grid inside the challenge window")
    func buildsHeatGrid() async {
        let model = TrendsModel(api: MockAPIClient())
        await model.load()
        #expect(!model.heatCells.isEmpty)
        #expect(model.heatCells.allSatisfy { $0.date >= Rulebook.challengeStart && $0.date <= LocalDay.today })
        #expect(model.heatCells.contains { $0.date == LocalDay.today })
        #expect(Set(model.heatCells.map(\.date)).count == model.heatCells.count)
        #expect(model.weekKeys.contains(LocalDay.isoWeekKey(LocalDay.today)))
    }

    @Test("Every heat cell is findable by its week and weekday label")
    func cellLookup() async {
        let model = TrendsModel(api: MockAPIClient())
        await model.load()
        for cell in model.heatCells {
            #expect(model.cell(week: cell.weekKey, weekday: cell.weekdayLabel)?.date == cell.date)
        }
        #expect(model.cell(week: "1999-W01", weekday: "T2") == nil)
    }

    @Test("Weekday domain values run Monday to Sunday and are language-neutral keys")
    func weekdayLabels() {
        #expect(TrendsModel.weekdayLabels == ["T2", "T3", "T4", "T5", "T6", "T7", "CN"])
    }

    // `weekdayTitle`/`weekLabel` read the process-global in-app language, so their vi/en text
    // is asserted in `LocalizedTests`.

    // The heat-cell VoiceOver label (`TrendsModel.accessibilityLabel(for:)`) is asserted in
    // `LocalizedTests` — it reads the process-global in-app language, so it must not race here.

    @Test("Day entries collect just that day's rows from the paged history")
    func dayEntries() async throws {
        let client = MockAPIClient(historyPageSize: 3)
        let history = try await client.myEntries(cursor: nil)
        let day = try #require(history.entries.first?.localDate)
        let model = DayEntriesModel(api: client, date: day)
        await model.load()
        #expect(!model.entries.isEmpty)
        #expect(model.entries.allSatisfy { $0.localDate == day })
        #expect(model.errorMessage == nil)
    }

    @Test("Surfaces a load failure")
    func surfacesFailure() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let model = TrendsModel(api: FailingClient(error: error))
        await model.load()
        #expect(model.state == .failed(error.userMessage))
    }
}
