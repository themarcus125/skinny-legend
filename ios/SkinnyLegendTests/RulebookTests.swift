import Testing
@testable import SkinnyLegend

@Suite("Rulebook")
struct RulebookTests {
    @Test("Matches the spec §2 table")
    func matchesSpecTable() throws {
        #expect(Rulebook.points(for: .exercise) == 3)
        #expect(Rulebook.points(for: .meal) == 2)
        #expect(Rulebook.points(for: .group) == 3)

        let exercise = try #require(Rulebook.rule(for: .exercise))
        #expect(exercise.capCount == 1)
        #expect(exercise.capPeriod == .day)

        let group = try #require(Rulebook.rule(for: .group))
        #expect(group.capCount == 2)
        #expect(group.capPeriod == .week)

        #expect(Rulebook.streakLength == 7)
        #expect(Rulebook.streakPoints == 5)
        #expect(Rulebook.challengeStart == "2026-09-08")
        #expect(Rulebook.challengeEnd == "2026-12-25")
    }

    @Test("Cap nouns are Vietnamese and period-correct")
    func capNouns() {
        #expect(Rulebook.capNoun(for: .exercise) == "hôm nay")
        #expect(Rulebook.capNoun(for: .meal) == "hôm nay")
        #expect(Rulebook.capNoun(for: .group) == "tuần này")
    }

    @Test("Projects points for a set of categories, skipping capped ones")
    func projectsPoints() {
        #expect(Rulebook.projectedPoints(for: [.exercise, .group], capped: []) == 6)
        #expect(Rulebook.projectedPoints(for: [.exercise, .group], capped: [.group]) == 3)
        #expect(Rulebook.projectedPoints(for: [], capped: []) == 0)
    }
}
