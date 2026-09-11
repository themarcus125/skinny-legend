import CoreLocation
import Foundation
import MapKit

/// MapKit only — no third-party geocoding, no API key (spec §8).
struct MapKitPlaceSearch: PlaceSearching {
    func nearbyPOIs(around point: GeoPoint, radius: CLLocationDistance) async -> [Place] {
        let request = MKLocalPointsOfInterestRequest(center: point.coordinate, radius: radius)
        guard let response = try? await MKLocalSearch(request: request).start() else { return [] }
        return response.mapItems
            .compactMap { item -> (place: Place, distance: CLLocationDistance)? in
                guard let name = item.name, !name.isEmpty else { return nil }
                let itemPoint = GeoPoint(item.location.coordinate)
                let place = Place(
                    id: item.identifier?.rawValue ?? "\(name)|\(itemPoint.lat),\(itemPoint.lng)",
                    name: name,
                    point: itemPoint,
                    source: .poi
                )
                return (place, point.distance(to: itemPoint))
            }
            .sorted { $0.distance < $1.distance }
            .map(\.place)
    }

    func reverseGeocode(_ point: GeoPoint) async -> Place? {
        guard let request = MKReverseGeocodingRequest(location: point.location),
              let items = try? await request.mapItems,
              let item = items.first
        else { return nil }
        guard let name = item.address?.shortAddress ?? item.name, !name.isEmpty else { return nil }
        return Place(id: "geocode|\(point.lat),\(point.lng)", name: name, point: point, source: .geocode)
    }
}
