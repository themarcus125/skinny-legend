import CoreLocation
import Foundation

/// Offline stand-ins so the Track flow shows a real place chip in the Simulator, which has no
/// location services and no MapKit network access.
struct MockLocationFixer: LocationFixing {
    var point: GeoPoint? = GeoPoint(lat: 10.7769, lng: 106.7009)

    func currentFix() async -> GeoPoint? {
        try? await Task.sleep(for: .milliseconds(400))
        return point
    }
}

struct MockPlaceSearch: PlaceSearching {
    func nearbyPOIs(around point: GeoPoint, radius: CLLocationDistance) async -> [Place] {
        try? await Task.sleep(for: .milliseconds(300))
        return MockSeed.places.enumerated().map { index, name in
            Place(
                id: "mock-poi-\(index)",
                name: name,
                point: GeoPoint(lat: point.lat + Double(index) * 0.0003, lng: point.lng + Double(index) * 0.0002),
                source: .poi
            )
        }
    }

    func reverseGeocode(_ point: GeoPoint) async -> Place? {
        Place(id: "mock-geocode", name: "Phường 12, Quận Bình Thạnh", point: point, source: .geocode)
    }
}
