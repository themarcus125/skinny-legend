import Testing
import Foundation
@testable import SkinnyLegend

@Suite("MapModel")
@MainActor
struct MapModelTests {
    @Test("Loads and clusters pins, covering every seeded place with coordinates")
    func loads() async throws {
        let model = MapModel(api: MockAPIClient(today: "2026-09-11"))
        #expect(model.state == .idle)
        await model.load()
        guard case .loaded(let clusters) = model.state else {
            Issue.record("Expected .loaded, got \(model.state)")
            return
        }
        #expect(!clusters.isEmpty)
        let seenPlaces = Set(clusters.flatMap { $0.pins.compactMap(\.placeName) })
        #expect(seenPlaces == Set(MockSeed.placeCoordinates.keys))
    }

    @Test("A refresh keeps .loaded throughout and swaps in the new pins")
    func refreshKeepsLoadedState() async throws {
        let page = try Fixture.decode(MapPinsPage.self, "map_pins")
        let firstPage = MapPinsPage(pins: Array(page.pins.prefix(1)))
        let client = SequencedMapClient(pages: [firstPage, page])
        let model = MapModel(api: client)

        await model.load()
        guard case .loaded(let before) = model.state else {
            Issue.record("Expected .loaded after the first load, got \(model.state)")
            return
        }
        #expect(before.flatMap(\.pins).count == 1)

        // Snapshot the state while the second request is in flight: it must still be .loaded.
        await client.setInFlightHook { @MainActor in model.state }
        await model.load()

        let inFlight = await client.inFlightStates
        #expect(inFlight.count == 1)
        #expect(inFlight.allSatisfy { if case .loaded = $0 { true } else { false } })
        guard case .loaded(let after) = model.state else {
            Issue.record("Expected .loaded after the refresh, got \(model.state)")
            return
        }
        #expect(after.flatMap(\.pins).count == page.pins.count)
    }

    @Test("Surfaces a failure with the Vietnamese message")
    func surfacesFailure() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let model = MapModel(api: FailingClient(error: error))
        await model.load()
        #expect(model.state == .failed(error.userMessage))
    }
}

/// Answers `mapPins(days:)` with each page in turn (repeating the last one), and can call a hook
/// while a request is in flight so a test can inspect the model mid-load.
actor SequencedMapClient: APIClient {
    private var pages: [MapPinsPage]
    private var inFlightHook: (@Sendable () async -> MapModel.State)?
    private(set) var inFlightStates: [MapModel.State] = []

    init(pages: [MapPinsPage]) {
        self.pages = pages
    }

    func setInFlightHook(_ hook: @escaping @Sendable () async -> MapModel.State) {
        inFlightHook = hook
    }

    func mapPins(days: Int) async throws -> MapPinsPage {
        if let inFlightHook {
            inFlightStates.append(await inFlightHook())
        }
        let page = pages.first ?? MapPinsPage(pins: [])
        if pages.count > 1 { pages.removeFirst() }
        return page
    }

    func session() async throws -> UserDTO { fatalError("unused in this test") }
    func me() async throws -> UserDTO { fatalError("unused in this test") }
    func updateMe(displayName: String?, avatarKey: String?, locale: UserDTO.Locale?) async throws -> UserDTO { fatalError("unused in this test") }
    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO { fatalError("unused in this test") }
    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws { fatalError("unused in this test") }
    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse { fatalError("unused in this test") }
    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse { fatalError("unused in this test") }
    func deleteEntry(id: String) async throws { fatalError("unused in this test") }
    func myEntries(cursor: String?) async throws -> HistoryPage { fatalError("unused in this test") }
    func dashboard() async throws -> DashboardDTO { fatalError("unused in this test") }
    func leaderboard() async throws -> [LeaderboardRow] { fatalError("unused in this test") }
    func trends() async throws -> TrendsDTO { fatalError("unused in this test") }
    func feed(cursor: String?) async throws -> FeedPage { fatalError("unused in this test") }
    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage { fatalError("unused in this test") }
    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws { fatalError("unused in this test") }
}
