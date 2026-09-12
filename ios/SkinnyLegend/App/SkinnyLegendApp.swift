import SwiftUI
import FirebaseCore

@main
struct SkinnyLegendApp: App {
    @State private var env: AppEnvironment

    init() {
        // Firebase is configured only for a real backend build: a Simulator run with `-mockAPI`
        // (or any build without GoogleService-Info.plist) never touches it (spec §14).
        if AppMode.useLiveBackend {
            FirebaseApp.configure()
        }
        _env = State(initialValue: AppEnvironment.make())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .tint(Theme.flame)
        }
    }
}
