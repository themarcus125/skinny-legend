import SwiftUI
import FirebaseCore

@main
struct SkinnyLegendApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var env: AppEnvironment
    /// The DEBUG "sample data" override. Flipping it bumps `generation`, which rebuilds the
    /// environment and re-keys the root so the whole tree comes back on the new services.
    @State private var modeStore = AppModeStore.shared

    init() {
        // Firebase is configured only for a real backend build: a Simulator run with `-mockAPI`
        // (or any build without GoogleService-Info.plist) never touches it (spec §14).
        if AppMode.useLiveBackend {
            FirebaseApp.configure()
        }
        let env = AppEnvironment.make()
        env.activateLocale()
        _env = State(initialValue: env)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .id(modeStore.generation)
                .tint(Theme.primary)
                .onChange(of: modeStore.generation) { _, _ in rebuildEnvironment() }
        }
    }

    /// Leaving sample-data mode on a build that launched into it never configured Firebase, so
    /// that is done here rather than only in `init` — `AppEnvironment.make()` would otherwise
    /// construct `FirebaseAuthService` against an unconfigured `FirebaseApp`.
    private func rebuildEnvironment() {
        if AppMode.useLiveBackend, FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        let rebuilt = AppEnvironment.make()
        rebuilt.activateLocale()
        env = rebuilt
    }
}
