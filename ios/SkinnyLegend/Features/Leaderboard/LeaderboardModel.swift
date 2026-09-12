import Foundation
import Observation

@MainActor
@Observable
final class LeaderboardModel {
    enum State: Equatable {
        case loading
        case loaded([LeaderboardRow])
        case failed(String)
    }

    private let api: any APIClient
    var state: State = .loading

    init(api: any APIClient) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.leaderboard())
        } catch let error as APIError {
            state = .failed(error.userMessage)
        } catch {
            state = .failed("Không tải được bảng xếp hạng.")
        }
    }
}
