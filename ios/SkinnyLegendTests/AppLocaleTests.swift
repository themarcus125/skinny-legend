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
        #expect(Rulebook.capNoun(for: .exercise) == "hôm nay")
        #expect(Rulebook.capNoun(for: .meal) == "hôm nay")
        #expect(Rulebook.capNoun(for: .group) == "tuần này")
        Localized.setLanguage(.en)
        #expect(Rulebook.capNoun(for: .exercise) == "today")
        #expect(Rulebook.capNoun(for: .meal) == "today")
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

    // MARK: - Feature-model strings (Track, Dashboard, Feed): the models hand the views plain
    // `String`s, so their own fallback copy must follow the in-app language as well. A plain
    // `URLError` skips the `APIError.userMessage` path and lands on each model's literal.

    @MainActor @Test func trackModelFailuresFollowTheInAppLanguage() async {
        defer { Localized.setLanguage(.vi) }
        let model = TrackModel(api: FailingClient(error: URLError(.badServerResponse)))
        await model.prepare(imageData: Data("nope".utf8))
        #expect(model.phase == .failed("Ảnh không hợp lệ, hãy chọn ảnh khác."))

        Localized.setLanguage(.en)
        await model.prepare(imageData: Data("nope".utf8))
        #expect(model.phase == .failed("That photo isn't valid, pick another one."))

        await model.prepare(imageData: JPEGFactory.make(width: 600, height: 400))
        await model.upload()
        #expect(model.phase == .failed("Photo upload failed."))

        model.photoKey = "photos/test.jpg"
        await model.createEntry(placeName: nil, placeSource: PlaceSource.none, point: nil)
        #expect(model.phase == .failed("Couldn't analyse the photo, please try again."))
    }

    @MainActor @Test func verdictSheetModelStringsFollowTheInAppLanguage() async {
        defer { Localized.setLanguage(.vi) }
        let entry = EntryDTO(id: "e1", userId: "u1", photoUrl: "mock://photo/1", thumbUrl: "mock://photo/1",
                             takenAt: Date(), localDate: LocalDay.today, status: .pending, categories: [.exercise, .group],
                             placeName: nil, placeSource: PlaceSource.none, createdAt: Date())
        let verdict = VerdictDTO(categories: [.exercise, .group], healthy: nil, confidence: 0.8,
                                 reason: "Ảnh chụp tại phòng gym với hai người.", model: "mock/offline", failed: false)
        let model = VerdictSheetModel(
            api: FailingClient(error: URLError(.badServerResponse)), entry: entry, mode: .created(verdict),
            capsHit: CapsHit(exercise: true, meal: false, group: true), cappedCategories: [.exercise, .group],
            projectedPoints: 0, placeName: nil, placeSource: PlaceSource.none
        )
        #expect(model.capWarnings == [
            "Đã đủ Tập luyện hôm nay — mục này không cộng thêm điểm.",
            "Đã đủ Hoạt động nhóm tuần này — mục này không cộng thêm điểm.",
        ])

        Localized.setLanguage(.en)
        // The English value swaps the arguments positionally: period noun first, then the label.
        #expect(model.capWarnings == [
            "You've already hit your today Exercise limit — this one earns no extra points.",
            "You've already hit your this week Group activity limit — this one earns no extra points.",
        ])
        let confirmed = await model.confirm()
        #expect(confirmed == nil)
        #expect(model.errorMessage == "Couldn't save, please try again.")
    }

    @MainActor @Test func dashboardAndFeedFailuresFollowTheInAppLanguage() async {
        defer { Localized.setLanguage(.vi) }
        let client = FailingClient(error: URLError(.badServerResponse))
        let dashboard = DashboardModel(api: client)
        let feed = FeedModel(api: client)
        await dashboard.load()
        await feed.loadFirstPage()
        #expect(dashboard.state == .failed("Không tải được dữ liệu."))
        #expect(feed.errorMessage == "Không tải được nhật ký nhóm.")

        Localized.setLanguage(.en)
        await dashboard.load()
        await feed.loadFirstPage()
        #expect(dashboard.state == .failed("Couldn't load data."))
        #expect(feed.errorMessage == "Couldn't load the group feed.")
    }
}
