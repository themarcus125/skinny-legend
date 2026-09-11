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

    init(api: any APIClient) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.dashboard())
        } catch let error as APIError {
            state = .failed(error.userMessage)
        } catch {
            state = .failed("Không tải được dữ liệu.")
        }
    }
}
