import Foundation
import Testing
@testable import SkinnyLegend

@Suite("AppLocale")
struct AppLocaleTests {
    @Test func systemFollowsTheDeviceLanguage() {
        #expect(AppLocale.system.resolved(deviceLanguageCode: "en") == .en)
        #expect(AppLocale.system.resolved(deviceLanguageCode: "vi") == .vi)
    }

    @Test func systemFallsBackToVietnameseForAnyOtherLanguage() {
        #expect(AppLocale.system.resolved(deviceLanguageCode: "fr") == .vi)
        #expect(AppLocale.system.resolved(deviceLanguageCode: nil) == .vi)
    }

    @Test func anExplicitChoiceIgnoresTheDevice() {
        #expect(AppLocale.vi.resolved(deviceLanguageCode: "en") == .vi)
        #expect(AppLocale.en.resolved(deviceLanguageCode: "vi") == .en)
    }

    @Test func resolvedMapsToAConcreteLocale() {
        #expect(AppLocale.Resolved.vi.identifier == "vi")
        #expect(AppLocale.Resolved.en.identifier == "en")
        #expect(AppLocale.Resolved.vi.locale.identifier.hasPrefix("vi"))
    }

    @Test func storedRawValuesRoundTrip() {
        for value in AppLocale.allCases {
            #expect(AppLocale(rawValue: value.rawValue) == value)
        }
    }
}

/// `Localized` holds one process-wide language, so these run one at a time and every test
/// puts the default back before it returns.
@Suite("Localized", .serialized)
struct LocalizedTests {
    @Test func defaultsToVietnamese() {
        defer { Localized.setLanguage(.vi) }
        #expect(Localized.language == .vi)
        #expect(Localized.locale.identifier.hasPrefix("vi"))
        #expect(Localized.string("Ngôn ngữ") == "Ngôn ngữ")
    }

    @Test func switchingTheLanguageReturnsTheOtherTranslation() {
        defer { Localized.setLanguage(.vi) }
        Localized.setLanguage(.en)
        #expect(Localized.language == .en)
        #expect(Localized.locale.identifier.hasPrefix("en"))
        #expect(Localized.string("Ngôn ngữ") == "Language")
        #expect(Localized.string("Hệ thống") == "System")
        Localized.setLanguage(.vi)
        #expect(Localized.string("Ngôn ngữ") == "Ngôn ngữ")
    }

    @Test func eachShippedLanguageResolvesToItsOwnLprojBundle() {
        #expect(Localized.bundle(for: .en).bundleURL.lastPathComponent == "en.lproj")
        #expect(Localized.bundle(for: .vi).bundleURL.lastPathComponent == "vi.lproj")
    }

    @Test func anUnknownKeyFallsBackToTheKeyItself() {
        defer { Localized.setLanguage(.vi) }
        Localized.setLanguage(.en)
        #expect(Localized.string("Chuỗi này không có trong catalog") == "Chuỗi này không có trong catalog")
    }
}
