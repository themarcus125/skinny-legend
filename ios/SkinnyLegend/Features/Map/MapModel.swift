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

    /// Only the first load shows the spinner: a refresh over already-loaded pins keeps `.loaded`
    /// (and the `Map` mounted) until the new pins replace the old ones.
    func load(days: Int = 30) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        if case .loaded = state {} else {
            state = .loading
        }
        do {
            let page = try await api.mapPins(days: days)
            state = .loaded(MapClusterer.cluster(page.pins, radiusMeters: Self.clusterRadiusMeters))
        } catch let error as APIError {
            state = .failed(error.userMessage)
        } catch {
            state = .failed(Localized.string("Không tải được bản đồ."))
        }
    }
}
