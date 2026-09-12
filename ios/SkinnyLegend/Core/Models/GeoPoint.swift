import CoreLocation

/// A plain, `Sendable` coordinate. `CLLocationCoordinate2D` is neither `Equatable` nor `Codable`,
/// so every layer above CoreLocation trades in this type instead.
struct GeoPoint: Hashable, Sendable, Codable {
    var lat: Double
    var lng: Double

    init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }

    init(_ coordinate: CLLocationCoordinate2D) {
        self.init(lat: coordinate.latitude, lng: coordinate.longitude)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var location: CLLocation {
        CLLocation(latitude: lat, longitude: lng)
    }

    func distance(to other: GeoPoint) -> CLLocationDistance {
        location.distance(from: other.location)
    }
}
