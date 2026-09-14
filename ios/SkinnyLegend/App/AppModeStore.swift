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

    /// Where `PushRegistrar` keeps its install-scoped and per-user flags. Injected so tests can
    /// hand in a throwaway suite instead of writing to the process-wide defaults.
    @ObservationIgnored
    private let defaults: UserDefaults

    init(mockOverride: Bool = AppMode.mockOverride, defaults: UserDefaults = .standard) {
        self.isMockOverridden = mockOverride
        self.defaults = defaults
    }

    /// Enters sample-data mode. No-op when it is already on, so the root is not rebuilt twice.
    ///
    /// `outgoing` is the registrar belonging to the environment about to be thrown away — see
    /// `setOverride(_:outgoing:)` for why it has to be told.
    func enterMockMode(outgoing: PushRegistrar?) { setOverride(true, outgoing: outgoing) }

    /// Leaves sample-data mode and returns to the real backend (and therefore the sign-in screen).
    func leaveMockMode(outgoing: PushRegistrar?) { setOverride(false, outgoing: outgoing) }

    /// Flipping the override swaps the whole `AppEnvironment`, including its `PushRegistrar` —
    /// but the registrar's flags live in `UserDefaults`, not in the object, so a fresh registrar
    /// reads whatever the outgoing one left behind. Without this, reminders switched ON against
    /// the mock account would come back ON for the real one the moment the override is dropped
    /// (and vice versa). So the outgoing registrar clears its install-scoped state first —
    /// synchronously, before the environment goes away, and locally only: the mock has no server
    /// row to delete, and the live account's row belongs to the sign-out path, not to this.
    private func setOverride(_ isOn: Bool, outgoing: PushRegistrar?) {
        guard isOn != isMockOverridden else { return }
        outgoing?.clearLocalState()
        // The mock user is the same synthetic id on every entry into sample-data mode, so its
        // "already asked after the first confirmed entry" flag would otherwise make the prompt
        // un-rehearsable — and it is install-scoped state the live account should never inherit.
        defaults.removeObject(forKey: PushRegistrar.didAskKey(for: MockSeed.me.id))
        AppMode.mockOverride = isOn
        isMockOverridden = isOn
        generation += 1
    }
}
