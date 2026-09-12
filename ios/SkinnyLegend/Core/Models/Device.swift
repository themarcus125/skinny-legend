import Foundation

/// Mirrors the API `device_platform` enum. iOS is the only platform in v1 (spec §E out of scope).
enum DevicePlatform: String, Codable, Sendable {
    case ios
}

/// Mirrors the API `device_locale` enum. Vietnamese is the default everywhere.
enum DeviceLocale: String, Codable, Sendable {
    case vi
    case en

    /// Pure so it can be tested without touching `Locale.current`.
    static func from(_ locale: Locale) -> DeviceLocale {
        locale.language.languageCode?.identifier == "vi" ? .vi : .en
    }

    /// The wire value for a resolved app language — the two enums share raw values by design.
    init(_ resolved: AppLocale.Resolved) {
        self = resolved == .en ? .en : .vi
    }

    /// The language the app is *running in* (spec §D): the stored `AppLocale` choice, resolved,
    /// exactly as `Localized` holds it — not the device language, which the picker can override.
    static var current: DeviceLocale { DeviceLocale(Localized.language) }
}

/// A `device_tokens` row, as returned by `POST /me/devices`.
struct DeviceDTO: Codable, Sendable {
    let id: String
    let token: String
    let platform: String
    let locale: String
    let createdAt: Date
    let lastSeenAt: Date
}

struct DeviceEnvelope: Codable, Sendable {
    let device: DeviceDTO
}
