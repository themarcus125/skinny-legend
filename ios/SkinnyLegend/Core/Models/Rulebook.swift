import Foundation

/// The rulebook from spec §2, hard-coded on the client. The server remains the authority for
/// stored scores; this exists only so the verdict sheet can project points while the user edits
/// chips, and so `MockAPIClient` can score its seeded data offline.
enum Rulebook {
    struct Rule: Sendable, Hashable {
        let category: Category
        let points: Int
        let capCount: Int
        let capPeriod: CapPeriod
    }

    static let challengeStart: LocalDate = "2026-09-08"
    static let challengeEnd: LocalDate = "2026-12-25"
    static let streakLength = 7
    static let streakPoints = 5

    static let rules: [Rule] = [
        Rule(category: .exercise, points: 3, capCount: 1, capPeriod: .day),
        Rule(category: .meal, points: 2, capCount: 1, capPeriod: .day),
        Rule(category: .group, points: 3, capCount: 2, capPeriod: .week),
    ]

    static func rule(for category: Category) -> Rule? {
        rules.first { $0.category == category }
    }

    static func points(for category: Category) -> Int {
        rule(for: category)?.points ?? 0
    }

    /// The Vietnamese period noun used in cap warnings: "Đã đạt giới hạn hôm nay".
    static func capNoun(for category: Category) -> String {
        rule(for: category)?.capPeriod == .week ? "tuần này" : "hôm nay"
    }

    static func projectedPoints(for categories: Set<Category>, capped: Set<Category>) -> Int {
        categories.subtracting(capped).reduce(0) { $0 + points(for: $1) }
    }
}
