import Foundation
import Observation
import UIKit

/// Drives the Track flow: compress → presign → PUT upload. Spec §10 asks for one automatic retry
/// on upload failure, with the prepared photo kept so the user can retry by hand afterwards.
@MainActor
@Observable
final class TrackModel {
    enum Phase: Equatable {
        case idle
        case preparing
        case uploading(Double)
        case uploaded
        case analyzing
        case ready
        case failed(String)
    }

    private let api: any APIClient

    var phase: Phase = .idle
    var previewImage: UIImage?
    var prepared: PreparedPhoto?
    var photoKey: String?
    var createResult: CreateEntryResponse?

    init(api: any APIClient) {
        self.api = api
    }

    var isBusy: Bool {
        switch phase {
        case .preparing, .uploading, .analyzing: true
        case .idle, .uploaded, .ready, .failed: false
        }
    }

    /// Returns false when the bytes are not a decodable image.
    @discardableResult
    func prepare(imageData: Data) async -> Bool {
        phase = .preparing
        photoKey = nil
        do {
            let photo = try await Self.prepare(imageData)
            prepared = photo
            previewImage = UIImage(data: photo.jpeg)
            return true
        } catch {
            prepared = nil
            previewImage = nil
            phase = .failed("Ảnh không hợp lệ, hãy chọn ảnh khác.")
            return false
        }
    }

    /// Convenience used by tests and by any caller that does not need the two phases separately.
    func use(imageData: Data) async {
        guard await prepare(imageData: imageData) else { return }
        await upload()
    }

    func retryUpload() async {
        guard prepared != nil else { return }
        await upload()
    }

    func reset() {
        phase = .idle
        previewImage = nil
        prepared = nil
        photoKey = nil
        createResult = nil
    }

    /// One automatic retry, then the error is surfaced and `prepared` is kept for a manual retry.
    func upload() async {
        guard let photo = prepared else { return }
        for attempt in 1...2 {
            phase = .uploading(0)
            do {
                let presign = try await api.presign(kind: .photo, contentType: "image/jpeg")
                try await api.upload(photo.jpeg, to: presign, contentType: "image/jpeg") { [weak self] fraction in
                    Task { @MainActor in
                        guard let self, case .uploading = self.phase else { return }
                        self.phase = .uploading(fraction)
                    }
                }
                photoKey = presign.key
                phase = .uploaded
                return
            } catch let error as APIError {
                if attempt == 2 { phase = .failed(error.userMessage) }
            } catch {
                if attempt == 2 { phase = .failed("Tải ảnh lên thất bại.") }
            }
        }
    }

    /// `POST /entries` — the server fetches the photo, calls the vision model, and returns the
    /// pending entry plus its verdict and projection (spec §6).
    func createEntry(placeName: String?, placeSource: PlaceSource, point: GeoPoint?) async {
        guard let photoKey, let photo = prepared else { return }
        phase = .analyzing
        do {
            let input = CreateEntryInput(
                photoKey: photoKey,
                takenAt: photo.takenAt,
                lat: point?.lat,
                lng: point?.lng,
                placeName: placeName,
                placeSource: placeName == nil ? PlaceSource.none : placeSource
            )
            createResult = try await api.createEntry(input)
            phase = .ready
        } catch let error as APIError {
            phase = .failed(error.userMessage)
        } catch {
            phase = .failed("Không phân tích được ảnh, hãy thử lại.")
        }
    }

    /// Compression is CPU-bound, so it runs off the main actor.
    private nonisolated static func prepare(_ data: Data) async throws -> PreparedPhoto {
        try await Task.detached(priority: .userInitiated) {
            try ImagePipeline.prepare(data)
        }.value
    }
}
