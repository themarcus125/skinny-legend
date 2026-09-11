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
}
