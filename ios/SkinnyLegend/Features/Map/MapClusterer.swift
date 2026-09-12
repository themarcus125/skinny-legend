import Foundation

/// A group of nearby pins shown as a single annotation on the map.
struct MapCluster: Identifiable, Hashable {
    let id: String
    var center: GeoPoint
    var pins: [MapPinDTO]
}

/// Greedy, order-dependent clustering: cheap enough to run on every load (at most 500 pins,
/// spec's server-side cap) without a spatial index.
enum MapClusterer {
    /// Walks `pins` in the order given (the API/mock hand them back newest-first) and attaches
    /// each one to the first existing cluster within `radiusMeters` of its running mean center,
    /// or starts a new cluster. A cluster's `id` is its first (newest) pin's `entryId`.
    static func cluster(_ pins: [MapPinDTO], radiusMeters: Double) -> [MapCluster] {
        var clusters: [MapCluster] = []
        for pin in pins {
            let point = GeoPoint(lat: pin.lat, lng: pin.lng)
            if let index = clusters.firstIndex(where: { $0.center.distance(to: point) <= radiusMeters }) {
                clusters[index].pins.append(pin)
                let points = clusters[index].pins.map { GeoPoint(lat: $0.lat, lng: $0.lng) }
                clusters[index].center = GeoPoint(
                    lat: points.map(\.lat).reduce(0, +) / Double(points.count),
                    lng: points.map(\.lng).reduce(0, +) / Double(points.count)
                )
            } else {
                clusters.append(MapCluster(id: pin.entryId, center: point, pins: [pin]))
            }
        }
        return clusters
    }
}
