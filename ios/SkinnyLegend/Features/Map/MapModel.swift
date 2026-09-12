import Foundation
import Observation

/// Backs the group map (`GET /entries/map`): loads recent pins and clusters them for display.
@MainActor
@Observable
final class MapModel {
    enum State: Equatable {
        case idle
        case loading
        case loaded([MapCluster])
        case failed(String)
    }

    /// Nearby pins within this many meters merge into one annotation (`MapClusterer`).
    private static let clusterRadiusMeters: Double = 50

    private let api: any APIClient
    var state: State = .idle

    /// Guards against a second concurrent `load()` issuing a duplicate network request.
    @ObservationIgnored
    private var isLoading = false

    init(api: any APIClient) {
        self.api = api
    }

    func load(days: Int = 30) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        state = .loading
        do {
            let page = try await api.mapPins(days: days)
            state = .loaded(MapClusterer.cluster(page.pins, radiusMeters: Self.clusterRadiusMeters))
        } catch let error as APIError {
            state = .failed(error.userMessage)
        } catch {
            state = .failed("Không tải được bản đồ.")
        }
    }
}
