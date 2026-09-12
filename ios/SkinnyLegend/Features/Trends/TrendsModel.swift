import Foundation
import Observation

@MainActor
@Observable
final class TrendsModel {
    enum State: Equatable {
        case loading
        case loaded(TrendsDTO)
        case failed(String)
    }

    /// One square of the calendar heatmap. `weekKey` is the chart's Y value and `weekdayLabel`
    /// its X value, so a tap can be mapped back to a local date.
    struct HeatCell: Identifiable, Hashable {
        let date: LocalDate
        let points: Int
        let weekKey: String
        let weekdayLabel: String

        var id: LocalDate { date }
    }

    /// Monday-first, matching the ISO weeks the server scores with. These are the heatmap's
    /// X-domain values and each cell's identity, so they stay language-neutral (the Vietnamese
    /// abbreviations double as catalog keys); the axis renders them through `weekdayTitle`.
    static let weekdayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]

    /// The axis text for one of `weekdayLabels` in the in-app language: `T2` → `T2` / `Mon`.
    static func weekdayTitle(_ label: String) -> String {
        Localized.string(String.LocalizationValue(label))
    }

    /// The week-axis text for an ISO week key in the in-app language: `2026-W37` → `T37` / `W37`.
    static func weekLabel(_ weekKey: String) -> String {
        let number = String(weekKey.suffix(2))
        return Localized.string("T\(number)")
    }

    /// Eight weeks of squares, which is what `GET /me/trends` reports weeks for.
    private static let gridSpanDays = 55

    private let api: any APIClient
    var state: State = .loading
    private(set) var heatCells: [HeatCell] = []
    private(set) var weekKeys: [String] = []

    init(api: any APIClient) {
        self.api = api
    }

    func load() async {
        do {
            let trends = try await api.trends()
            state = .loaded(trends)
            buildGrid(from: trends.heatmap)
        } catch let error as APIError {
            state = .failed(error.userMessage)
        } catch {
            state = .failed(Localized.string("Không tải được xu hướng."))
        }
    }

    func cell(week: String, weekday: String) -> HeatCell? {
        heatCells.first { $0.weekKey == week && $0.weekdayLabel == weekday }
    }

    /// VoiceOver label for a heatmap square, e.g. `Thứ Tư, 09/09: 12 điểm` or
    /// `Thứ Năm, 10/09: không hoạt động`. Pure so it's covered without a chart on screen.
    static func accessibilityLabel(for cell: HeatCell) -> String {
        let day = LocalDay.display(cell.date)
        guard cell.points > 0 else { return Localized.string("\(day): không hoạt động") }
        return Localized.string("\(day): \(cell.points) điểm")
    }

    private func buildGrid(from heatmap: [HeatmapDay]) {
        let today = LocalDay.today
        let earliest = max(Rulebook.challengeStart, LocalDay.adding(-Self.gridSpanDays, to: today))
        // Step back to that week's Monday so the grid's columns line up, then clamp to the window.
        let monday = LocalDay.adding(-LocalDay.weekdayIndex(earliest), to: earliest)
        let start = max(Rulebook.challengeStart, monday)
        let pointsByDay = Dictionary(heatmap.map { ($0.date, $0.points) }, uniquingKeysWith: { first, _ in first })

        heatCells = LocalDay.each(from: start, to: today).map { day in
            HeatCell(
                date: day,
                points: pointsByDay[day] ?? 0,
                weekKey: LocalDay.isoWeekKey(day),
                weekdayLabel: Self.weekdayLabels[LocalDay.weekdayIndex(day)]
            )
        }
        var seen: Set<String> = []
        weekKeys = heatCells.map(\.weekKey).filter { seen.insert($0).inserted }
    }
}

/// `navigationDestination(item:)` needs an `Identifiable` payload, and `LocalDate` is a `String`.
struct DaySelection: Identifiable, Hashable {
    let date: LocalDate
    var id: LocalDate { date }
}
