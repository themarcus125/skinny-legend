import Testing
import Foundation
@testable import SkinnyLegend

@Suite("MapClusterer")
struct MapClustererTests {
    private func pin(_ id: String, _ lat: Double, _ lng: Double) -> MapPinDTO {
        MapPinDTO(entryId: id, lat: lat, lng: lng, placeName: nil, takenAt: Date(timeIntervalSince1970: 0), localDate: "2026-09-10", categories: [SkinnyLegend.Category.exercise], thumbUrl: nil, user: UserSummary(id: "u", displayName: "U", avatarUrl: nil))
    }
    @Test("Pins within the radius merge into one cluster with the mean center")
    func merges() {
        let clusters = MapClusterer.cluster([pin("a", 10.7700, 106.7000), pin("a2", 10.7701, 106.7001)], radiusMeters: 50)
        #expect(clusters.count == 1)
        #expect(clusters[0].pins.count == 2)
        #expect(abs(clusters[0].center.lat - 10.77005) < 0.00001)
    }
    @Test("Pins farther apart stay separate")
    func separate() {
        #expect(MapClusterer.cluster([pin("a", 10.77, 106.70), pin("b", 10.78, 106.71)], radiusMeters: 50).count == 2)
    }
    @Test("Empty input yields no clusters")
    func empty() { #expect(MapClusterer.cluster([], radiusMeters: 50).isEmpty) }
}
