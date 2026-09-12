import Foundation
import Observation

@MainActor
@Observable
final class DashboardModel {
    enum State: Equatable {
        case loading
        case loaded(DashboardDTO)
        case failed(String)
    }

    private let api: any APIClient
    var state: State = .loading

    /// Guards against a second concurrent `load()` (e.g. `.task` firing while `.refreshable`
    /// is still in flight) issuing a duplicate network request.
    @ObservationIgnored
    private var isLoading = false

    init(api: any APIClient) {
        self.api = api
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            state = .loaded(try await api.dashboard())
        } catch let error as APIError {
            state = .failed(error.userMessage)
        } catch {
            state = .failed(Localized.string("Không tải được dữ liệu."))
        }
    }
}
