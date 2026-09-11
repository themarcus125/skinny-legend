import CoreGraphics
import Foundation
import ImageIO
import UIKit

struct PreparedPhoto: Sendable, Equatable {
    /// Max 1200 px on the long edge, JPEG quality 0.8 (spec §6).
    let jpeg: Data
    /// EXIF `DateTimeOriginal` when present, otherwise the moment the photo was picked.
    let takenAt: Date
    /// EXIF GPS when present (spec §8 step 2).
    let coordinate: GeoPoint?
    let pixelSize: CGSize
}

enum ImagePipelineError: Error, Equatable {
    case decodeFailed
    case encodeFailed
}

/// Resizes and re-encodes a picked photo, and lifts the metadata the Track flow needs.
/// Pure and synchronous so it is trivially testable; call it off the main actor.
enum ImagePipeline {
    static let maxLongEdge: CGFloat = 1200
    static let jpegQuality: CGFloat = 0.8

    static func prepare(_ data: Data, now: Date = Date(), timeZone: TimeZone = .current) throws -> PreparedPhoto {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0 else {
            throw ImagePipelineError.decodeFailed
        }
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]

        // `CreateThumbnailFromImageAlways` + `ThumbnailMaxPixelSize` caps the long edge without
        // upscaling, and `WithTransform` bakes in the EXIF orientation.
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxLongEdge,
        ]
        guard let resized = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw ImagePipelineError.decodeFailed
        }
        guard let jpeg = UIImage(cgImage: resized).jpegData(compressionQuality: jpegQuality) else {
            throw ImagePipelineError.encodeFailed
        }

        return PreparedPhoto(
            jpeg: jpeg,
            takenAt: captureDate(properties, timeZone: timeZone) ?? now,
            coordinate: coordinate(properties),
            pixelSize: CGSize(width: resized.width, height: resized.height)
        )
    }

    static func coordinate(_ properties: [CFString: Any]) -> GeoPoint? {
        guard let gps = properties[kCGImagePropertyGPSDictionary] as? [CFString: Any],
              let latitude = gps[kCGImagePropertyGPSLatitude] as? Double,
              let longitude = gps[kCGImagePropertyGPSLongitude] as? Double
        else { return nil }
        let latitudeRef = gps[kCGImagePropertyGPSLatitudeRef] as? String ?? "N"
        let longitudeRef = gps[kCGImagePropertyGPSLongitudeRef] as? String ?? "E"
        return GeoPoint(
            lat: latitudeRef.uppercased() == "S" ? -latitude : latitude,
            lng: longitudeRef.uppercased() == "W" ? -longitude : longitude
        )
    }

    static func captureDate(_ properties: [CFString: Any], timeZone: TimeZone) -> Date? {
        guard let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any],
              let raw = exif[kCGImagePropertyExifDateTimeOriginal] as? String
        else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy:MM:dd HH:mm:ss"
        return formatter.date(from: raw)
    }
}
