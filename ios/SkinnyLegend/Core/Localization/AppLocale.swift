import Foundation

/// The language preference the user picks in Account (spec §D). `.system` is stored locally
/// so the app keeps following the device; the *resolved* `vi`/`en` value is what goes to the
/// server in `PATCH /me { locale }`, because server-side copy (AI reasons, push) needs a
/// concrete language, not "whatever this phone is set to".
enum AppLocale: String, CaseIterable, Sendable, Hashable {
    case system
    case vi
    case en

    /// `@AppStorage` key. Namespaced so it can never collide with a Firebase or SDK default.
    static let storageKey = "com.themarcus125.skinnylegend.appLocale"

    /// A language the app actually ships.
    enum Resolved: String, CaseIterable, Sendable, Hashable {
        case vi
        case en

        var identifier: String { rawValue }
        var locale: Locale { Locale(identifier: rawValue) }
    }

    /// `.system` follows the device; anything the app does not ship falls back to Vietnamese.
    func resolved(deviceLanguageCode: String?) -> Resolved {
        switch self {
        case .vi: .vi
        case .en: .en
        case .system: deviceLanguageCode == "en" ? .en : .vi
        }
    }

    /// The device's preferred language code, e.g. `"vi"` for `vi-VN`.
    static var deviceLanguageCode: String? {
        Locale.preferredLanguages.first.flatMap { Locale(identifier: $0).language.languageCode?.identifier }
    }

    func resolved() -> Resolved { resolved(deviceLanguageCode: Self.deviceLanguageCode) }
}

extension UserDTO.Locale {
    /// The wire value for a resolved app language — the two enums share raw values by design.
    init(_ resolved: AppLocale.Resolved) {
        self = resolved == .en ? .en : .vi
    }
}
