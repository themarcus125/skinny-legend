import Foundation

/// `GET /entries/map` — mirrors `apps/api/src/routes/read.ts`'s `/entries/map` pin shape,
/// field for field. Coordinates are shown here (unlike the feed, spec §8 step 7) because the
/// map screen exists specifically to plot them.
struct MapPinDTO: Codable, Hashable, Identifiable, Sendable {
    let entryId: String
    let lat: Double
    let lng: Double
    let placeName: String?
    let takenAt: Date
    let localDate: LocalDate
    let categories: [Category]
    let thumbUrl: String?
    let user: UserSummary

    var id: String { entryId }
}

struct MapPinsPage: Codable, Sendable {
    let pins: [MapPinDTO]
}
