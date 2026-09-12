import Foundation
import Synchronization

/// The single lookup for every string that must be a *resolved* `String` rather than a
/// `LocalizedStringKey`: `@Observable` models, thrown errors, `Category.label`,
/// `LocalDay.display`, accessibility sentences built by interpolation, chart series names and
/// anything that feeds `Text(verbatim:)`.
///
/// SwiftUI's `.environment(\.locale, …)` only re-resolves `Text`/`LocalizedStringKey` sites, and
/// Foundation's `String(localized:)` follows the *device* language. So the in-app picker
/// changes the language here (`setLanguage`) and every lookup goes through the `.lproj`
/// bundle of the chosen language — that is what keeps the UI from ending up mixed.
///
/// SwiftUI view initialisers (`Text`, `Button`, `Label`, `ContentUnavailableView`,
/// `.navigationTitle`, `.confirmationDialog`) take `LocalizedStringKey` already — pass the
/// Vietnamese literal straight to them and do NOT wrap it.
enum Localized {
    /// The current language. `AppEnvironment` seeds it from the stored `AppLocale` and updates
    /// it before publishing a new preference; every reader is non-isolated, hence the lock.
    private static let current = Mutex<AppLocale.Resolved>(.vi)

    static var language: AppLocale.Resolved {
        current.withLock { $0 }
    }

    static func setLanguage(_ language: AppLocale.Resolved) {
        current.withLock { $0 = language }
    }

    /// The `Locale` matching the current language — for formatters and `LocalDay.display`.
    static var locale: Locale { language.locale }

    /// The bundle every lookup reads from: the current language's `.lproj`.
    static var bundle: Bundle { bundle(for: language) }

    /// The compiled String Catalog for one language, or `Bundle.main` when that `.lproj` is
    /// missing (a source-language-only build), in which case the key itself is rendered.
    static func bundle(for language: AppLocale.Resolved) -> Bundle {
        guard let url = Bundle.main.url(forResource: language.identifier, withExtension: "lproj"),
              let bundle = Bundle(url: url) else { return .main }
        return bundle
    }

    /// `String(localized:)` that follows the in-app language instead of the device's.
    static func string(_ key: String.LocalizationValue) -> String {
        String(localized: key, bundle: bundle, locale: locale)
    }
}
