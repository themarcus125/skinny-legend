import CoreLocation
import Foundation
import Observation

struct Place: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let point: GeoPoint
    let source: PlaceSource
}

protocol PlaceSearching: Sendable {
    /// Nearest-first points of interest within `radius` metres.
    func nearbyPOIs(around point: GeoPoint, radius: CLLocationDistance) async -> [Place]
    /// Ward/district level fallback.
    func reverseGeocode(_ point: GeoPoint) async -> Place?
}

protocol LocationFixing: Sendable {
    /// One coarse fix, or nil when permission is denied or no fix arrives in time.
    func currentFix() async -> GeoPoint?
}

/// Implements spec §8 exactly: EXIF GPS first, otherwise one live fix; then a 150 m POI search,
/// then reverse geocoding; denial or no fix means no chip and `place_source = none`.
@MainActor
@Observable
final class PlaceResolver {
    static let searchRadius: CLLocationDistance = 150
    static let candidateLimit = 5

    private let search: any PlaceSearching
    private let locator: any LocationFixing

    private(set) var candidates: [Place] = []
    private(set) var fix: GeoPoint?
    private(set) var selected: Place?
    private(set) var isResolving = false

    init(search: any PlaceSearching, locator: any LocationFixing) {
        self.search = search
        self.locator = locator
    }

    var placeName: String? { selected?.name }
    var placeSource: PlaceSource { selected?.source ?? PlaceSource.none }

    func resolve(exifPoint: GeoPoint?) async {
        isResolving = true
        candidates = []
        selected = nil
        defer { isResolving = false }

        // `exifPoint ?? await locator.currentFix()` does not compile: `??`'s right-hand side is
        // an `@autoclosure`, which cannot contain `await`. Branch explicitly instead.
        let resolvedPoint: GeoPoint?
        if let exifPoint {
            resolvedPoint = exifPoint
        } else {
            resolvedPoint = await locator.currentFix()
        }
        guard let point = resolvedPoint else {
            fix = nil
            return
        }
        fix = point

        let pois = Array(await search.nearbyPOIs(around: point, radius: Self.searchRadius).prefix(Self.candidateLimit))
        if let nearest = pois.first {
            candidates = pois
            selected = nearest
            return
        }
        if let geocoded = await search.reverseGeocode(point) {
            candidates = [geocoded]
            selected = geocoded
        }
    }

    /// Spec §8 step 5: picking from the "Đổi" list makes the place a manual choice.
    func choose(_ place: Place) {
        selected = Place(id: place.id, name: place.name, point: place.point, source: .manual)
    }

    func clear() {
        selected = nil
    }
}
