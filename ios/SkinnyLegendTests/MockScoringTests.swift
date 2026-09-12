import Testing
import Foundation
@testable import SkinnyLegend

@Suite("MockScoring")
struct MockScoringTests {
    private func entry(_ id: String, _ day: LocalDate, _ categories: [SkinnyLegend.Category], hour: Int = 8) -> MockScoring.Input {
        let takenAt = LocalDay.calendar.date(byAdding: .hour, value: hour - 12, to: LocalDay.date(from: day)!)!
        return MockScoring.Input(id: id, localDate: day, takenAt: takenAt, categories: categories)
    }

    @Test("The daily exercise cap zeroes the second entry of the day")
    func dailyCap() {
        let result = MockScoring.compute(
            entries: [entry("a", "2026-09-08", [.exercise], hour: 7), entry("b", "2026-09-08", [.exercise], hour: 18)],
            asOf: "2026-09-08"
        )
        #expect(result.total == 3)
        #expect(result.scored.first { $0.entryID == "b" }?.points == 0)
        #expect(result.scored.first { $0.entryID == "b" }?.capped == true)
        #expect(result.capsHit[.exercise] == true)
    }

    @Test("Stacking earns both categories from one photo")
    func stacking() {
        let result = MockScoring.compute(entries: [entry("a", "2026-09-08", [.exercise, .group])], asOf: "2026-09-08")
        #expect(result.total == 6)
        #expect(result.byDay["2026-09-08"]?.points == 6)
        #expect(result.byCategory[.group] == 3)
    }

    @Test("The weekly group cap allows two entries per Monday-start week")
    func weeklyCap() {
        let result = MockScoring.compute(
            entries: [
                entry("a", "2026-09-08", [.group]),
                entry("b", "2026-09-10", [.group]),
                entry("c", "2026-09-13", [.group]),
                entry("d", "2026-09-14", [.group]),
            ],
            asOf: "2026-09-14"
        )
        #expect(result.scored.first { $0.entryID == "c" }?.capped == true)
        #expect(result.scored.first { $0.entryID == "d" }?.capped == false)
        #expect(result.byCategory[.group] == 9)
    }

    @Test("Seven consecutive active days award the streak bonus once")
    func streakBonus() {
        let days = LocalDay.each(from: "2026-09-08", to: "2026-09-14")
        let entries = days.enumerated().map { entry("e\($0.offset)", $0.element, [.exercise]) }
        let result = MockScoring.compute(entries: entries, asOf: "2026-09-15")
        // An empty "today" does not break the streak until the day is over (spec §5 rule 4).
        #expect(result.streak.current == 7)
        #expect(result.streak.longest == 7)
        #expect(result.streak.bonusesAwarded == 1)
        #expect(result.streak.bonusPoints == 5)
        #expect(result.total == 7 * 3 + 5)
    }

    @Test("A gap day resets the streak once that day has elapsed")
    func streakResetsAfterAGap() {
        let result = MockScoring.compute(
            entries: [
                entry("a", "2026-09-08", [.exercise]),
                entry("b", "2026-09-09", [.exercise]),
                entry("d", "2026-09-11", [.exercise]),
            ],
            asOf: "2026-09-11"
        )
        #expect(result.streak.longest == 2)
        #expect(result.streak.current == 1)   // 2026-09-10 was empty and has elapsed
        #expect(result.streak.bonusesAwarded == 0)
    }

    @Test("A group-only day does not keep the streak alive")
    func groupOnlyDoesNotExtendStreak() {
        let result = MockScoring.compute(
            entries: [entry("a", "2026-09-08", [.exercise]), entry("b", "2026-09-09", [.group]), entry("c", "2026-09-10", [.exercise])],
            asOf: "2026-09-10"
        )
        #expect(result.streak.current == 1)
        #expect(result.streak.longest == 1)
    }

    @Test("Entries outside the challenge window are ignored")
    func outsideWindow() {
        let result = MockScoring.compute(entries: [entry("a", "2026-09-07", [.exercise])], asOf: "2026-09-08")
        #expect(result.total == 0)
        #expect(result.scored.isEmpty)
    }
}
