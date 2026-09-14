import Testing
import Foundation
@testable import SkinnyLegend

@Suite("TrackModel")
@MainActor
struct TrackModelTests {
    @Test("A picked photo is compressed, presigned and uploaded")
    func uploadsPickedPhoto() async throws {
        let client = MockAPIClient()
        let model = TrackModel(api: client)
        await model.use(imageData: JPEGFactory.make(width: 2400, height: 1600, gps: GeoPoint(lat: 10.7769, lng: 106.7009)))

        #expect(model.phase == .uploaded)
        #expect(model.photoKey?.hasPrefix("photos/") == true)
        #expect(model.prepared?.coordinate != nil)
        #expect(model.prepared?.pixelSize.width == 1200)
    }

    @Test("Creating the entry after upload returns it already confirmed from the AI verdict")
    func createsConfirmedEntry() async throws {
        let client = MockAPIClient()
        let model = TrackModel(api: client)
        await model.use(imageData: JPEGFactory.make(width: 600, height: 400))
        #expect(model.phase == .uploaded)

        await model.createEntry(placeName: "Phòng gym California", placeSource: .poi, point: nil)
        #expect(model.phase == .ready)
        let result = try #require(model.createResult)
        #expect(result.verdict.failed == false)
        #expect(result.entry.status == .confirmed)
        #expect(result.entry.categories == result.verdict.categories)
        #expect(!result.entry.categories.isEmpty)
        #expect(result.entry.placeName == "Phòng gym California")
    }

    @Test("A photo that cannot be decoded fails without touching the network")
    func rejectsBadPhoto() async {
        let model = TrackModel(api: MockAPIClient())
        await model.use(imageData: Data("nope".utf8))
        #expect(model.phase == .failed(Localized.string("Ảnh không hợp lệ, hãy chọn ảnh khác.")))
        #expect(model.photoKey == nil)
    }

    @Test("reset clears everything back to idle")
    func resets() async {
        let model = TrackModel(api: MockAPIClient())
        await model.use(imageData: JPEGFactory.make(width: 600, height: 400))
        model.reset()
        #expect(model.phase == .idle)
        #expect(model.photoKey == nil)
        #expect(model.previewImage == nil)
        #expect(model.prepared == nil)
    }
}
