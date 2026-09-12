import Foundation

struct DayPoints: Codable, Hashable, Sendable {
    let points: Int
    let categories: [Category]
}

struct YesterdayPoints: Codable, Hashable, Sendable {
    let points: Int
}

/// `StreakResult` from `packages/shared/src/scoring/types.ts`.
struct StreakDTO: Codable, Hashable, Sendable {
    let current: Int
    let longest: Int
    let bonusesAwarded: Int
    let bonusPoints: Int
}

/// `GET /me/dashboard`.
struct DashboardDTO: Codable, Hashable, Sendable {
    let today: DayPoints
    let yesterday: YesterdayPoints
    let deltaVsYesterday: Int
    let streak: StreakDTO
    let total: Int
    let rank: Int
    let memberCount: Int
    let capsHit: CapsHit
    /// Categories that can still score today — the dashboard checklist.
    let remaining: [Category]
}

/// One row of `GET /leaderboard`.
struct LeaderboardRow: Codable, Identifiable, Hashable, Sendable {
    let rank: Int
    let user: UserSummary
    let total: Int
    let weekPoints: Int
    let isMe: Bool

    var id: String { user.id }
}

struct LeaderboardEnvelope: Codable, Sendable {
    let leaderboard: [LeaderboardRow]
}

struct TrendWeek: Codable, Identifiable, Hashable, Sendable {
    let week: String
    let mine: Int
    let groupAvg: Double
    let rank: Int

    var id: String { week }
}

struct HeatmapDay: Codable, Identifiable, Hashable, Sendable {
    let date: LocalDate
    let points: Int

    var id: LocalDate { date }
}

/// `Record<Category, number>` from the server.
struct CategoryPoints: Codable, Hashable, Sendable {
    let exercise: Int
    let meal: Int
    let group: Int

    subscript(category: Category) -> Int {
        switch category {
        case .exercise: exercise
        case .meal: meal
        case .group: group
        }
    }

    var total: Int { exercise + meal + group }
}

/// `GET /me/trends`.
struct TrendsDTO: Codable, Hashable, Sendable {
    let weeks: [TrendWeek]
    let heatmap: [HeatmapDay]
    let byCategory: CategoryPoints
    let streakBonus: Int
}

/// `POST /uploads/presign`.
struct PresignDTO: Codable, Sendable {
    let key: String
    let url: String
    let expiresAt: Date
}

struct FeedbackDTO: Codable, Sendable {
    let id: String
    let userId: String
    let message: String
    let screenshotKey: String?
    let appVersion: String?
    let createdAt: Date
}

struct FeedbackEnvelope: Codable, Sendable {
    let feedback: FeedbackDTO
}
