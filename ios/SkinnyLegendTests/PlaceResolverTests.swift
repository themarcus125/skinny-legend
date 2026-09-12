import Testing
import Foundation
import CoreLocation
@testable import SkinnyLegend

private let hcmc = GeoPoint(lat: 10.7769, lng: 106.7009)

private struct FakeSearch: PlaceSearching {
    var pois: [Place] = []
    var geocoded: Place?

    func nearbyPOIs(around point: GeoPoint, radius: CLLocationDistance) async -> [Place] { pois }
    func reverseGeocode(_ point: GeoPoint) async -> Place? { geocoded }
}

private struct FakeLocator: LocationFixing {
    var fix: GeoPoint?
    func currentFix() async -> GeoPoint? { fix }
}

private func poi(_ name: String, offset: Double) -> Place {
    Place(id: name, name: name, point: GeoPoint(lat: hcmc.lat + offset, lng: hcmc.lng), source: .poi)
}

/// A search whose result depends on the point it was asked about, so a test can tell an old
/// resolve's fix apart from a newer resolve's fix.
private struct PointAwareSearch: PlaceSearching {
    let poisForPoint: @Sendable (GeoPoint) -> [Place]

    func nearbyPOIs(around point: GeoPoint, radius: CLLocationDistance) async -> [Place] {
        poisForPoint(point)
    }

    func reverseGeocode(_ point: GeoPoint) async -> Place? { nil }
}

/// A locator whose `currentFix()` suspends until the test explicitly resumes it, so a test can
/// interleave a `clear()` or a newer `resolve()` call while an older one is still awaiting its fix.
private actor GatedLocator: LocationFixing {
    private var pendingFix: CheckedContinuation<GeoPoint?, Never>?
    private var waiter: CheckedContinuation<Void, Never>?

    func currentFix() async -> GeoPoint? {
        await withCheckedContinuation { continuation in
            pendingFix = continuation
            waiter?.resume()
            waiter = nil
        }
    }

    /// Suspends until `currentFix()` has been called and is parked waiting on `resume(with:)`.
    func waitUntilCalled() async {
        if pendingFix != nil { return }
        await withCheckedContinuation { continuation in
            waiter = continuation
        }
    }

    func resume(with point: GeoPoint?) {
        pendingFix?.resume(returning: point)
        pendingFix = nil
    }
}

@Suite("PlaceResolver")
@MainActor
struct PlaceResolverTests {
    @Test("Picks the nearest POI and marks it as a POI source")
    func picksNearestPOI() async {
        let search = FakeSearch(pois: [poi("Phòng gym California", offset: 0.0001), poi("Cà phê Cộng", offset: 0.0009)])
        let resolver = PlaceResolver(search: search, locator: FakeLocator(fix: hcmc))
        await resolver.resolve(exifPoint: nil)
        #expect(resolver.selected?.name == "Phòng gym California")
        #expect(resolver.placeSource == .poi)
        #expect(resolver.placeName == "Phòng gym California")
    }

    @Test("Prefers the photo's EXIF coordinate over a live fix")
    func prefersExif() async {
        let exif = GeoPoint(lat: 21.0278, lng: 105.8342)
        // The locator has no fix, so a resolved place proves the EXIF point was used.
        let resolver = PlaceResolver(search: FakeSearch(pois: [poi("Sân Mỹ Đình", offset: 0)]), locator: FakeLocator(fix: nil))
        await resolver.resolve(exifPoint: exif)
        #expect(resolver.fix == exif)
        #expect(resolver.selected?.source == .poi)
        #expect(resolver.selected?.name == "Sân Mỹ Đình")
    }

    @Test("Falls back to reverse geocoding when there is no POI")
    func fallsBackToGeocode() async {
        let ward = Place(id: "ward", name: "Phường 12, Quận Bình Thạnh", point: hcmc, source: .geocode)
        let resolver = PlaceResolver(search: FakeSearch(pois: [], geocoded: ward), locator: FakeLocator(fix: hcmc))
        await resolver.resolve(exifPoint: nil)
        #expect(resolver.selected?.name == "Phường 12, Quận Bình Thạnh")
        #expect(resolver.placeSource == .geocode)
    }

    @Test("No fix means no chip and placeSource none")
    func noFix() async {
        let resolver = PlaceResolver(search: FakeSearch(pois: [poi("A", offset: 0)]), locator: FakeLocator(fix: nil))
        await resolver.resolve(exifPoint: nil)
        #expect(resolver.selected == nil)
        #expect(resolver.placeName == nil)
        #expect(resolver.placeSource == .none)
        #expect(resolver.candidates.isEmpty)
    }

    @Test("Offers at most the five nearest candidates for Đổi")
    func capsCandidates() async {
        let pois = (0..<9).map { poi("POI \($0)", offset: Double($0) * 0.0001) }
        let resolver = PlaceResolver(search: FakeSearch(pois: pois), locator: FakeLocator(fix: hcmc))
        await resolver.resolve(exifPoint: nil)
        #expect(resolver.candidates.count == 5)
        #expect(resolver.candidates.first?.name == "POI 0")
    }

    @Test("Choosing from the sheet switches the source to manual")
    func chooseIsManual() async {
        let resolver = PlaceResolver(search: FakeSearch(pois: [poi("A", offset: 0), poi("B", offset: 0.0002)]), locator: FakeLocator(fix: hcmc))
        await resolver.resolve(exifPoint: nil)
        let second = resolver.candidates[1]
        resolver.choose(second)
        #expect(resolver.selected?.name == "B")
        #expect(resolver.placeSource == .manual)
    }

    @Test("Clearing removes the chip without touching the candidates")
    func clears() async {
        let resolver = PlaceResolver(search: FakeSearch(pois: [poi("A", offset: 0)]), locator: FakeLocator(fix: hcmc))
        await resolver.resolve(exifPoint: nil)
        resolver.clear()
        #expect(resolver.selected == nil)
        #expect(resolver.placeSource == .none)
        #expect(resolver.candidates.count == 1)
    }

    @Test("A stale resolve does not overwrite state after clear()")
    func staleResolveDroppedAfterClear() async {
        let locator = GatedLocator()
        let resolver = PlaceResolver(search: FakeSearch(pois: [poi("A", offset: 0)]), locator: locator)

        let staleTask = Task { await resolver.resolve(exifPoint: nil) }
        await locator.waitUntilCalled()

        resolver.clear()
        await locator.resume(with: hcmc)
        await staleTask.value

        #expect(resolver.selected == nil)
        #expect(resolver.candidates.isEmpty)
        #expect(resolver.fix == nil)
    }

    @Test("A newer resolve wins over an older one that finishes later")
    func newerResolveWinsOverStaleOne() async {
        let oldPoint = hcmc
        let newPoint = GeoPoint(lat: 21.0278, lng: 105.8342)
        let search = PointAwareSearch { point in
            point == newPoint
                ? [Place(id: "new", name: "New", point: newPoint, source: .poi)]
                : [Place(id: "old", name: "Old", point: oldPoint, source: .poi)]
        }
        let locator = GatedLocator()
        let resolver = PlaceResolver(search: search, locator: locator)

        let staleTask = Task { await resolver.resolve(exifPoint: nil) }
        await locator.waitUntilCalled()

        // The newer resolve supplies its own EXIF point, so it never touches the locator and
        // completes fully while the older one is still parked in `currentFix()`.
        await resolver.resolve(exifPoint: newPoint)
        #expect(resolver.selected?.name == "New")

        // Letting the stale resolve finish must not clobber the newer result.
        await locator.resume(with: oldPoint)
        await staleTask.value

        #expect(resolver.selected?.name == "New")
        #expect(resolver.fix == newPoint)
    }
}
