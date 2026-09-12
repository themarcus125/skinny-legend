import Testing
import Foundation
import ImageIO
@testable import SkinnyLegend

@Suite("Avatar pipeline")
@MainActor
struct AvatarPipelineTests {
    private func pixelSize(_ data: Data) -> CGSize? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return nil }
        return CGSize(width: width, height: height)
    }

    @Test("Crops a landscape photo to a 512 px square")
    func cropsLandscape() throws {
        let data = try ImagePipeline.prepareAvatar(JPEGFactory.make(width: 1600, height: 900))
        #expect(pixelSize(data) == CGSize(width: 512, height: 512))
    }

    @Test("Crops a portrait photo to a 512 px square")
    func cropsPortrait() throws {
        let data = try ImagePipeline.prepareAvatar(JPEGFactory.make(width: 900, height: 1600))
        #expect(pixelSize(data) == CGSize(width: 512, height: 512))
    }

    @Test("Upscales nothing: a small square stays square")
    func smallSquare() throws {
        let data = try ImagePipeline.prepareAvatar(JPEGFactory.make(width: 200, height: 200))
        let size = try #require(pixelSize(data))
        #expect(size.width == size.height)
        #expect(size.width <= 512)
    }

    @Test("Rejects non-image bytes")
    func rejectsGarbage() {
        #expect(throws: ImagePipelineError.decodeFailed) {
            try ImagePipeline.prepareAvatar(Data("nope".utf8))
        }
    }
}
