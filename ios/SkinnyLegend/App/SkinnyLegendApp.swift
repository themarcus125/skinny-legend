import SwiftUI
import FirebaseCore

@main
struct SkinnyLegendApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var env: AppEnvironment

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
                .tint(Theme.flame)
        }
    }
}
