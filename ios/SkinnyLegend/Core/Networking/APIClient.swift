import Foundation

enum UploadKind: String, Sendable {
    case photo
    case avatar
    case feedback
}

/// `POST /entries` body. Optionals are omitted from the JSON when nil.
struct CreateEntryInput: Encodable, Sendable {
    let photoKey: String
    let takenAt: Date
    let lat: Double?
    let lng: Double?
    let placeName: String?
    let placeSource: PlaceSource?
}

/// `PATCH /entries/:id` body. `placeName` is always encoded — a `null` clears the stored place.
struct ConfirmEntryInput: Encodable, Sendable {
    let categories: [Category]
    let placeName: String?
    let placeSource: PlaceSource

    enum CodingKeys: String, CodingKey {
        case categories, placeName, placeSource
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(categories, forKey: .categories)
        try container.encode(placeName, forKey: .placeName)
        try container.encode(placeSource, forKey: .placeSource)
    }
}

typealias TokenProvider = @Sendable () async throws -> String

/// Every network call the app makes. `LiveAPIClient` talks to the Hono API; `MockAPIClient`
/// answers from memory so the whole app runs offline in the Simulator (spec §14).
protocol APIClient: Sendable {
    func session() async throws -> UserDTO
    func me() async throws -> UserDTO
    func updateMe(displayName: String?, avatarKey: String?) async throws -> UserDTO

    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO
    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws

    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse
    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse
    func deleteEntry(id: String) async throws
    func myEntries(cursor: String?) async throws -> HistoryPage

    func dashboard() async throws -> DashboardDTO
    func leaderboard() async throws -> [LeaderboardRow]
    func trends() async throws -> TrendsDTO
    func feed(cursor: String?) async throws -> FeedPage
    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage
    func mapPins(days: Int) async throws -> MapPinsPage

    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws
}
