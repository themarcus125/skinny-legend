import Foundation

/// Decides whether the app talks to the real backend or to the in-memory mock. Normally that is
/// settled once per launch by the `-mockAPI` argument; a DEBUG build can also flip into the mock
/// at runtime from the sign-in screen (see `AppModeStore`), which is what `mockOverride` carries.
enum AppMode {
    /// Which set of services `AppEnvironment.make()` should stand up.
    enum Services: Equatable, Sendable {
        case live
        case mock
    }

    /// Where the DEBUG "Dùng dữ liệu mẫu" override is persisted.
    static let mockOverrideKey = "app.mockOverride"

    /// Set by the `SkinnyLegend` scheme's default launch arguments, and by
    /// `xcrun simctl launch booted com.themarcus125.skinnylegend -mockAPI`.
    static var launchArgumentIsMock: Bool {
        ProcessInfo.processInfo.arguments.contains("-mockAPI")
    }

    /// The runtime override, off unless a DEBUG build turned it on.
    ///
    /// Compiled out of Release entirely — both halves. The flag lives in `UserDefaults`, which
    /// survives a Debug-to-Release reinstall on the same device, so a Release build that still
    /// *read* it could boot straight into the mock with no UI anywhere to turn it off (the
    /// "Dùng dữ liệu mẫu" control is itself `#if DEBUG`). With the getter gone, `services(...)`
    /// provably receives `false` for `mockOverride` in Release.
    static var mockOverride: Bool {
        get {
            #if DEBUG
            UserDefaults.standard.bool(forKey: mockOverrideKey)
            #else
            false
            #endif
        }
        set {
            #if DEBUG
            UserDefaults.standard.set(newValue, forKey: mockOverrideKey)
            #endif
        }
    }

    static var isMock: Bool {
        launchArgumentIsMock || mockOverride
    }

    static var hasFirebasePlist: Bool {
        Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
    }

    /// Firebase is configured, and the live API client used, only here.
    static var useLiveBackend: Bool {
        services(launchArgumentIsMock: launchArgumentIsMock,
                 mockOverride: mockOverride,
                 hasFirebasePlist: hasFirebasePlist) == .live
    }

    /// The whole decision, as one pure function over the three inputs, so it can be unit tested
    /// without touching `ProcessInfo`, `Bundle` or `UserDefaults`. Either mock signal wins, and a
    /// launch with no `GoogleService-Info.plist` must land on the mock rather than stand up
    /// `FirebaseAuthService` against an unconfigured `FirebaseApp` and crash.
    static func services(launchArgumentIsMock: Bool, mockOverride: Bool, hasFirebasePlist: Bool) -> Services {
        servicesAreLive(isMock: launchArgumentIsMock || mockOverride, hasFirebasePlist: hasFirebasePlist)
            ? .live
            : .mock
    }

    /// Pure decision behind `services`, kept as its own step because "is this run mock?" and "is
    /// Firebase configured?" are independent reasons to fall back.
    static func servicesAreLive(isMock: Bool, hasFirebasePlist: Bool) -> Bool {
        !isMock && hasFirebasePlist
    }

    /// Environment first (a scheme, or a device on the same Wi-Fi pointing at a laptop running
    /// the Hono API), then the bundle's `API_BASE_URL` — fed per configuration from
    /// `project.yml`, so a Release/TestFlight build resolves to the deployed API instead of
    /// `localhost`. The literal remains only as a last resort for a bundle without the key.
    static var apiBaseURL: URL {
        resolveBaseURL(
            environment: ProcessInfo.processInfo.environment,
            infoPlist: Bundle.main.infoDictionary ?? [:]
        )
    }

    /// Pure resolution order behind `apiBaseURL`, injectable for tests: a set but unparseable or
    /// empty value at one level falls through to the next rather than crashing the launch.
    static func resolveBaseURL(environment: [String: String], infoPlist: [String: Any]) -> URL {
        if let url = url(from: environment["API_BASE_URL"]) { return url }
        if let url = url(from: infoPlist["API_BASE_URL"] as? String) { return url }
        return URL(string: "http://localhost:3000")!
    }

    private static func url(from raw: String?) -> URL? {
        guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty,
              let url = URL(string: trimmed), url.scheme != nil else { return nil }
        return url
    }

    static var appVersion: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(short) (\(build))"
    }

    /// Group fund page (spec v1.1 §A). Per-challenge, so a constant rather than an API field.
    static let momoFundURL = URL(string: "https://quy.momo.vn/v2/GZqk7REIhy?cover=f131")!
}
