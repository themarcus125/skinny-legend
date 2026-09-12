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

    // MARK: - Core strings that are plain `String`s (ruling A): they must follow the in-app
    // language, not the device's. These live in this one `.serialized` suite because
    // `Localized` is process-global and a second serialized suite would still run in parallel
    // with this one.

    @Test func categoryLabelsFollowTheInAppLanguage() {
        defer { Localized.setLanguage(.vi) }
        #expect(SkinnyLegend.Category.exercise.label == "Tập luyện")
        #expect(SkinnyLegend.Category.meal.shortLabel == "Bữa ăn")
        Localized.setLanguage(.en)
        #expect(SkinnyLegend.Category.exercise.label == "Exercise")
        #expect(SkinnyLegend.Category.meal.label == "Healthy meal")
        #expect(SkinnyLegend.Category.group.label == "Group activity")
        #expect(SkinnyLegend.Category.meal.shortLabel == "Meal")
        #expect(SkinnyLegend.Category.group.shortLabel == "Group")
    }

    @Test func capNounsFollowTheInAppLanguage() {
        defer { Localized.setLanguage(.vi) }
        Localized.setLanguage(.en)
        #expect(Rulebook.capNoun(for: .exercise) == "today")
        #expect(Rulebook.capNoun(for: .group) == "this week")
    }

    @Test func apiErrorUserMessageFollowsTheInAppLanguage() {
        defer { Localized.setLanguage(.vi) }
        let pending = APIError(status: 403, code: "pending_approval", message: "Account awaiting admin approval")
        let unknown = APIError(status: 500, code: "boom", message: "")
        let serverText = APIError(status: 500, code: "boom", message: "Server said so")
        #expect(pending.userMessage == "Tài khoản đang chờ duyệt.")
        Localized.setLanguage(.en)
        #expect(pending.userMessage == "Your account is awaiting approval.")
        #expect(unknown.userMessage == "Something went wrong.")
        #expect(serverText.userMessage == "Server said so")
    }

    @Test func apiErrorStaticFailuresAreResolvedAtReadTime() {
        defer { Localized.setLanguage(.vi) }
        #expect(APIError.malformedURL.message == "Địa chỉ máy chủ không hợp lệ.")
        Localized.setLanguage(.en)
        #expect(APIError.malformedURL.message == "The server address isn't valid.")
        #expect(APIError.malformedResponse.message == "The server returned an invalid response.")
        #expect(APIError.decoding(URLError(.cannotDecodeRawData)).message == "The data that came back isn't valid.")
        #expect(APIError.unauthenticated.message == "Missing or invalid token")
    }

    @Test func authErrorUserMessageFollowsTheInAppLanguage() {
        defer { Localized.setLanguage(.vi) }
        #expect(AuthError.notSignedIn.userMessage == "Bạn chưa đăng nhập.")
        Localized.setLanguage(.en)
        #expect(AuthError.notSignedIn.userMessage == "You're not signed in.")
        #expect(AuthError.cancelled.userMessage == "Sign-in cancelled.")
        #expect(AuthError.provider("kept verbatim").userMessage == "kept verbatim")
    }

    @Test func localDayDisplayFollowsTheInAppLanguage() {
        defer { Localized.setLanguage(.vi) }
        #expect(LocalDay.display("2026-09-08") == "Thứ Ba, 08/09")
        Localized.setLanguage(.en)
        #expect(LocalDay.display("2026-09-08") == "Tuesday, 08/09")
        #expect(LocalDay.weekdaySymbol(0) == "Monday")
    }
}
