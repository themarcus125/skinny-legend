import Foundation
import Observation

/// Carries the DEBUG-only "sample data" override (`AppMode.mockOverride`) as observable state, so
/// flipping it rebuilds the `AppEnvironment` — and therefore the API client, auth service and
/// push registrar — without a relaunch.
///
/// `generation` is what the root view keys itself on: it changes on every flip, in either
/// direction, so SwiftUI tears the tree down and rebuilds it against the new environment.
@MainActor
@Observable
final class AppModeStore {
    static let shared = AppModeStore()

    private(set) var isMockOverridden: Bool
    private(set) var generation = 0

    init(mockOverride: Bool = AppMode.mockOverride) {
        self.isMockOverridden = mockOverride
    }

    /// Enters sample-data mode. No-op when it is already on, so the root is not rebuilt twice.
    func enterMockMode() { setOverride(true) }

    /// Leaves sample-data mode and returns to the real backend (and therefore the sign-in screen).
    func leaveMockMode() { setOverride(false) }

    private func setOverride(_ isOn: Bool) {
        guard isOn != isMockOverridden else { return }
        AppMode.mockOverride = isOn
        isMockOverridden = isOn
        generation += 1
    }
}
