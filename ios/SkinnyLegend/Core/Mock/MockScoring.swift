import Foundation

/// A faithful client-side port of `computeScore` (spec §5), used only by `MockAPIClient` so the
/// offline Simulator build has self-consistent dashboards, leaderboards and trends.
enum MockScoring {
    struct Input: Sendable, Hashable {
        let id: String
        let localDate: LocalDate
        let takenAt: Date
        let categories: [Category]
    }

    struct Scored: Sendable, Hashable {
        let entryID: String
        let category: Category
        let points: Int
        let capped: Bool
    }

    struct DayScore: Sendable, Hashable {
        var points: Int
        var categories: [Category]
    }

    struct Result: Sendable {
        var total: Int
        var byCategory: CategoryPoints
        var streakBonus: Int
        var byDay: [LocalDate: DayScore]
        var scored: [Scored]
        var streak: StreakDTO
        var capsHit: CapsHit
    }

    /// Only `exercise` and `meal` keep a streak alive (spec §5 rule 4).
    private static let streakCategories: Set<Category> = [.exercise, .meal]

    static func compute(entries: [Input], asOf: LocalDate) -> Result {
        let inWindow = entries
            .filter { $0.localDate >= Rulebook.challengeStart && $0.localDate <= Rulebook.challengeEnd && $0.localDate <= asOf }
            .sorted { $0.takenAt < $1.takenAt }

        var usage: [String: Int] = [:]
        var scored: [Scored] = []
        for entry in inWindow {
            for category in entry.categories {
                guard let rule = Rulebook.rule(for: category) else { continue }
                let period = rule.capPeriod == .day ? entry.localDate : LocalDay.isoWeekKey(entry.localDate)
                let key = "\(category.rawValue):\(period)"
                let used = usage[key] ?? 0
                let capped = used >= rule.capCount
                usage[key] = used + 1
                scored.append(Scored(entryID: entry.id, category: category, points: capped ? 0 : rule.points, capped: capped))
            }
        }

        let dayByEntry = Dictionary(inWindow.map { ($0.id, $0.localDate) }, uniquingKeysWith: { first, _ in first })
        var exercise = 0, meal = 0, group = 0
        var byDay: [LocalDate: DayScore] = [:]
        var activeDays: Set<LocalDate> = []

        for item in scored {
            guard let day = dayByEntry[item.entryID] else { continue }
            switch item.category {
            case .exercise: exercise += item.points
            case .meal: meal += item.points
            case .group: group += item.points
            }
            var dayScore = byDay[day] ?? DayScore(points: 0, categories: [])
            dayScore.points += item.points
            if !dayScore.categories.contains(item.category) { dayScore.categories.append(item.category) }
            byDay[day] = dayScore
            if item.points > 0 && streakCategories.contains(item.category) { activeDays.insert(day) }
        }

        let streak = computeStreak(activeDays: activeDays, asOf: asOf)
        let byCategory = CategoryPoints(exercise: exercise, meal: meal, group: group)

        var caps: [Category: Bool] = [:]
        for rule in Rulebook.rules {
            let period = rule.capPeriod == .day ? asOf : LocalDay.isoWeekKey(asOf)
            let count = scored.filter { item in
                guard item.category == rule.category, item.points > 0, let day = dayByEntry[item.entryID] else { return false }
                return (rule.capPeriod == .day ? day : LocalDay.isoWeekKey(day)) == period
            }.count
            caps[rule.category] = count >= rule.capCount
        }

        return Result(
            total: byCategory.total + streak.bonusPoints,
            byCategory: byCategory,
            streakBonus: streak.bonusPoints,
            byDay: byDay,
            scored: scored,
            streak: streak,
            capsHit: CapsHit(exercise: caps[.exercise] ?? false, meal: caps[.meal] ?? false, group: caps[.group] ?? false)
        )
    }

    /// Mirrors `computeStreak`: every elapsed day is judged, but an empty *today* does not break
    /// the streak until the day is over.
    private static func computeStreak(activeDays: Set<LocalDate>, asOf: LocalDate) -> StreakDTO {
        let end = min(asOf, Rulebook.challengeEnd)
        let graceApplies = asOf <= Rulebook.challengeEnd
        let lastFullDay = LocalDay.adding(-1, to: end)

        var current = 0
        var longest = 0
        var bonuses = 0

        func consider(_ day: LocalDate) {
            if activeDays.contains(day) {
                current += 1
                if current > longest { longest = current }
                if current % Rulebook.streakLength == 0 { bonuses += 1 }
            } else {
                current = 0
            }
        }

        if lastFullDay >= Rulebook.challengeStart {
            for day in LocalDay.each(from: Rulebook.challengeStart, to: lastFullDay) { consider(day) }
        }
        if end >= Rulebook.challengeStart {
            if graceApplies {
                if activeDays.contains(end) { consider(end) }
            } else {
                consider(end)
            }
        }

        return StreakDTO(current: current, longest: longest, bonusesAwarded: bonuses, bonusPoints: bonuses * Rulebook.streakPoints)
    }
}
