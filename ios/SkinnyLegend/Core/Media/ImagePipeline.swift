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

    /// Avatars are 512 px squares (spec §6 Uploads): centre-crop to a square, then downsample.
    static let avatarEdge: CGFloat = 512

    static func prepareAvatar(_ data: Data) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let pixelWidth = properties[kCGImagePropertyPixelWidth] as? Int,
              let pixelHeight = properties[kCGImagePropertyPixelHeight] as? Int
        else {
            throw ImagePipelineError.decodeFailed
        }
        // Decode at full resolution with EXIF orientation baked in (`WithTransform`), capping the
        // thumbnail at the image's own largest raw dimension so nothing is downsampled yet — the
        // crop below has to run against the actual pixel grid, not a size already shrunk to 512
        // on the long edge (which would crop the *short* edge down to well under a 512 square).
        let orientOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(pixelWidth, pixelHeight),
        ]
        guard let oriented = CGImageSourceCreateThumbnailAtIndex(source, 0, orientOptions as CFDictionary) else {
            throw ImagePipelineError.decodeFailed
        }
        let edge = min(oriented.width, oriented.height)
        let crop = CGRect(
            x: (oriented.width - edge) / 2,
            y: (oriented.height - edge) / 2,
            width: edge,
            height: edge
        )
        guard let square = oriented.cropping(to: crop) else { throw ImagePipelineError.decodeFailed }

        // Downsample the square crop to `avatarEdge`, never upscaling a smaller original.
        let targetEdge = min(CGFloat(edge), avatarEdge)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: CGSize(width: targetEdge, height: targetEdge), format: format).image { _ in
            UIImage(cgImage: square).draw(in: CGRect(x: 0, y: 0, width: targetEdge, height: targetEdge))
        }
        guard let jpeg = resized.jpegData(compressionQuality: jpegQuality) else {
            throw ImagePipelineError.encodeFailed
        }
        return jpeg
    }
}
