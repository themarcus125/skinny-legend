import Foundation

/// `toEntryDto` in `apps/api/src/routes/entries.ts`, field for field.
struct EntryDTO: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let userId: String
    let photoUrl: String
    let thumbUrl: String?
    let takenAt: Date
    let localDate: LocalDate
    let status: EntryStatus
    let categories: [Category]
    let placeName: String?
    let placeSource: PlaceSource
    let createdAt: Date
}

/// `GET /entries/mine` flattens the entry and adds its scored points.
struct HistoryEntryDTO: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let userId: String
    let photoUrl: String
    let thumbUrl: String?
    let takenAt: Date
    let localDate: LocalDate
    let status: EntryStatus
    let categories: [Category]
    let placeName: String?
    let placeSource: PlaceSource
    let createdAt: Date
    let points: Int
    let capped: Bool

    var entry: EntryDTO {
        EntryDTO(id: id, userId: userId, photoUrl: photoUrl, thumbUrl: thumbUrl, takenAt: takenAt,
                 localDate: localDate, status: status, categories: categories,
                 placeName: placeName, placeSource: placeSource, createdAt: createdAt)
    }
}

/// `GET /feed` flattens the entry and adds its author.
struct FeedEntryDTO: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let userId: String
    let photoUrl: String
    let thumbUrl: String?
    let takenAt: Date
    let localDate: LocalDate
    let status: EntryStatus
    let categories: [Category]
    let placeName: String?
    let placeSource: PlaceSource
    let createdAt: Date
    let user: UserSummary

    var entry: EntryDTO {
        EntryDTO(id: id, userId: userId, photoUrl: photoUrl, thumbUrl: thumbUrl, takenAt: takenAt,
                 localDate: localDate, status: status, categories: categories,
                 placeName: placeName, placeSource: placeSource, createdAt: createdAt)
    }
}

struct HistoryPage: Codable, Sendable {
    let entries: [HistoryEntryDTO]
    let nextCursor: String?
}

struct FeedPage: Codable, Sendable {
    let entries: [FeedEntryDTO]
    let nextCursor: String?
}

/// `GET /users/:id/entries` — plain entries, no points.
struct EntryPage: Codable, Sendable {
    let entries: [EntryDTO]
    let nextCursor: String?
}
