import CoreGraphics
import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers
@testable import SkinnyLegend

/// Builds real JPEG bytes (optionally with EXIF GPS and a capture date) so `ImagePipeline`
/// can be tested against actual image data rather than a stub.
@MainActor
enum JPEGFactory {
    static func make(width: Int, height: Int, gps: GeoPoint? = nil, dateTimeOriginal: String? = nil) -> Data {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.systemOrange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            UIColor.systemBlue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width / 2, height: height / 2))
        }

        let output = NSMutableData()
        guard let cgImage = image.cgImage,
              let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil)
        else { return Data() }

        var properties: [CFString: Any] = [:]
        if let gps {
            properties[kCGImagePropertyGPSDictionary] = [
                kCGImagePropertyGPSLatitude: abs(gps.lat),
                kCGImagePropertyGPSLatitudeRef: gps.lat < 0 ? "S" : "N",
                kCGImagePropertyGPSLongitude: abs(gps.lng),
                kCGImagePropertyGPSLongitudeRef: gps.lng < 0 ? "W" : "E",
            ] as CFDictionary
        }
        if let dateTimeOriginal {
            properties[kCGImagePropertyExifDictionary] = [
                kCGImagePropertyExifDateTimeOriginal: dateTimeOriginal
            ] as CFDictionary
        }
        CGImageDestinationAddImage(destination, cgImage, properties as CFDictionary)
        CGImageDestinationFinalize(destination)
        return output as Data
    }
}
