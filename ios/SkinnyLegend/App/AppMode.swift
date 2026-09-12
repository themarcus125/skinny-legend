import Foundation

/// Decides, once per launch, whether the app talks to the real backend or to the in-memory mock.
enum AppMode {
    /// Set by the `SkinnyLegend` scheme's default launch arguments, and by
    /// `xcrun simctl launch booted com.themarcus125.skinnylegend -mockAPI`.
    static var isMock: Bool {
        ProcessInfo.processInfo.arguments.contains("-mockAPI")
    }

    static var hasFirebasePlist: Bool {
        Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
    }

    /// Firebase is configured, and the live API client used, only here.
    static var useLiveBackend: Bool {
        servicesAreLive(isMock: isMock, hasFirebasePlist: hasFirebasePlist)
    }

    /// Pure decision behind `useLiveBackend`, pulled out so it can be unit tested without
    /// touching `ProcessInfo`/`Bundle`: a launch with neither `-mockAPI` nor a
    /// `GoogleService-Info.plist` must resolve to `false` (mock), not attempt to stand up
    /// `FirebaseAuthService` against an unconfigured `FirebaseApp` and crash.
    static func servicesAreLive(isMock: Bool, hasFirebasePlist: Bool) -> Bool {
        !isMock && hasFirebasePlist
    }

    /// Overridable so a device on the same Wi-Fi can point at a laptop running the Hono API.
    static var apiBaseURL: URL {
        if let raw = ProcessInfo.processInfo.environment["API_BASE_URL"], let url = URL(string: raw) {
            return url
        }
        return URL(string: "http://localhost:3000")!
    }

    static var appVersion: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(short) (\(build))"
    }

    /// Group fund page (spec v1.1 §A). Per-challenge, so a constant rather than an API field.
    static let momoFundURL = URL(string: "https://quy.momo.vn/v2/GZqk7REIhy?cover=f131")!
}
