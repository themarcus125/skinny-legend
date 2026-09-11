import Foundation

/// `toVerdictDto` in `entries.ts`. `healthy` is non-nil only when `meal` was detected.
struct VerdictDTO: Codable, Hashable, Sendable {
    let categories: [Category]
    let healthy: Bool?
    let confidence: Double
    let reason: String
    let model: String
    let failed: Bool
}

/// `Record<Category, boolean>` from the server, for the entry's own day/week.
struct CapsHit: Codable, Hashable, Sendable {
    let exercise: Bool
    let meal: Bool
    let group: Bool

    static let none = CapsHit(exercise: false, meal: false, group: false)

    subscript(category: Category) -> Bool {
        switch category {
        case .exercise: exercise
        case .meal: meal
        case .group: group
        }
    }

    var cappedSet: Set<Category> {
        Set(Category.allCases.filter { self[$0] })
    }
}

struct CreateEntryResponse: Codable, Sendable {
    let entry: EntryDTO
    let verdict: VerdictDTO
    let projectedPoints: Int
    let capsHit: CapsHit
    /// This entry's own categories that scored 0 because their cap was already full — unlike
    /// `capsHit`, which reports whether a category's cap is full for the entry's period even
    /// when this entry's own row is the one that just filled it.
    let cappedCategories: [Category]
}

struct ConfirmEntryResponse: Codable, Sendable {
    let entry: EntryDTO
    let projectedPoints: Int
    let capsHit: CapsHit
    let cappedCategories: [Category]
}
