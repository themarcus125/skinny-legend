import Testing
import Foundation
import ImageIO
@testable import SkinnyLegend

@Suite("ImagePipeline")
@MainActor
struct ImagePipelineTests {
    @Test("Downsizes the long edge to 1200 px and keeps the aspect ratio")
    func downsizesLongEdge() throws {
        let prepared = try ImagePipeline.prepare(JPEGFactory.make(width: 3000, height: 2000))
        #expect(prepared.pixelSize.width == 1200)
        #expect(prepared.pixelSize.height == 800)
        #expect(!prepared.jpeg.isEmpty)
    }

    @Test("Downsizes portrait photos on their long edge too")
    func downsizesPortrait() throws {
        let prepared = try ImagePipeline.prepare(JPEGFactory.make(width: 1500, height: 3000))
        #expect(prepared.pixelSize.height == 1200)
        #expect(prepared.pixelSize.width == 600)
    }

    @Test("Leaves an already-small photo at its original size")
    func keepsSmallPhotos() throws {
        let prepared = try ImagePipeline.prepare(JPEGFactory.make(width: 800, height: 600))
        #expect(prepared.pixelSize == CGSize(width: 800, height: 600))
    }

    @Test("The re-encoded JPEG is smaller than the original and still decodable")
    func recompresses() throws {
        let original = JPEGFactory.make(width: 3000, height: 2000)
        let prepared = try ImagePipeline.prepare(original)
        #expect(prepared.jpeg.count < original.count)
        #expect(CGImageSourceCreateWithData(prepared.jpeg as CFData, nil) != nil)
    }

    @Test("Reads EXIF GPS, honouring the N/S and E/W references")
    func readsGPS() throws {
        let point = GeoPoint(lat: 10.7769, lng: 106.7009)
        let prepared = try ImagePipeline.prepare(JPEGFactory.make(width: 400, height: 300, gps: point))
        let coordinate = try #require(prepared.coordinate)
        #expect(abs(coordinate.lat - point.lat) < 0.0001)
        #expect(abs(coordinate.lng - point.lng) < 0.0001)
    }

    @Test("Reads a southern/western EXIF GPS pair as negative")
    func readsNegativeGPS() throws {
        let point = GeoPoint(lat: -33.8688, lng: -70.6693)
        let prepared = try ImagePipeline.prepare(JPEGFactory.make(width: 400, height: 300, gps: point))
        let coordinate = try #require(prepared.coordinate)
        #expect(coordinate.lat < 0)
        #expect(coordinate.lng < 0)
    }

    @Test("A photo without GPS yields no coordinate")
    func noGPS() throws {
        let prepared = try ImagePipeline.prepare(JPEGFactory.make(width: 400, height: 300))
        #expect(prepared.coordinate == nil)
    }

    @Test("Uses EXIF DateTimeOriginal as takenAt, falling back to now")
    func readsCaptureDate() throws {
        let fallback = Date(timeIntervalSince1970: 1_788_000_000)
        let withExif = try ImagePipeline.prepare(
            JPEGFactory.make(width: 400, height: 300, dateTimeOriginal: "2026:09:11 08:30:00"),
            now: fallback,
            timeZone: LocalDay.timeZone
        )
        #expect(LocalDay.string(from: withExif.takenAt) == "2026-09-11")
        #expect(withExif.takenAt != fallback)

        let withoutExif = try ImagePipeline.prepare(JPEGFactory.make(width: 400, height: 300), now: fallback)
        #expect(withoutExif.takenAt == fallback)
    }

    @Test("Non-image bytes throw decodeFailed")
    func rejectsGarbage() {
        #expect(throws: ImagePipelineError.decodeFailed) {
            try ImagePipeline.prepare(Data("not an image".utf8))
        }
    }
}
