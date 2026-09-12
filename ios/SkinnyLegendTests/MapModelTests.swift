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

    @Test("Surfaces a failure with the Vietnamese message")
    func surfacesFailure() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let model = MapModel(api: FailingClient(error: error))
        await model.load()
        #expect(model.state == .failed(error.userMessage))
    }
}
