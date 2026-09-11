import SwiftUI

/// The three scoring categories from the rulebook (spec §2). Mirrors the API `category` enum.
enum Category: String, Codable, CaseIterable, Sendable, Identifiable, Hashable {
    case exercise
    case meal
    case group

    var id: String { rawValue }

    /// Full rulebook wording, used in the verdict sheet and the dashboard checklist.
    var label: String {
        switch self {
        case .exercise: "Tập luyện"
        case .meal: "Bữa ăn lành mạnh"
        case .group: "Hoạt động nhóm"
        }
    }

    /// Compact wording for chips in dense lists.
    var shortLabel: String {
        switch self {
        case .exercise: "Tập luyện"
        case .meal: "Bữa ăn"
        case .group: "Nhóm"
        }
    }

    var symbol: String {
        switch self {
        case .exercise: "figure.run"
        case .meal: "leaf.fill"
        case .group: "person.2.fill"
        }
    }

    var tint: Color {
        switch self {
        case .exercise: Theme.exercise
        case .meal: Theme.meal
        case .group: Theme.group
        }
    }
}

enum CapPeriod: String, Codable, Sendable, Hashable {
    case day
    case week
}

/// Mirrors the API `place_source` enum (spec §8).
enum PlaceSource: String, Codable, Sendable, Hashable {
    case poi
    case geocode
    case manual
    case none
}

/// Mirrors the API `entry_status` enum.
enum EntryStatus: String, Codable, Sendable, Hashable {
    case pending
    case confirmed
    case rejected
}
