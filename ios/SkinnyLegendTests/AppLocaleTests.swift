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
    /// The test host is the real app, whose launch seeds `Localized` from whatever language was
    /// last picked in that Simulator's container — so every test here starts from the source
    /// language explicitly rather than trusting the process default.
    init() {
        Localized.setLanguage(.vi)
    }

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
        // The verdict sheet's tracked-entry copy.
        #expect(Localized.string("Đã ghi nhận") == "Tracked")
        #expect(Localized.string("Chọn hoạt động") == "Choose activity")
        #expect(Localized.string("Lưu thay đổi") == "Save changes")
        #expect(Localized.string("Điểm đã cộng") == "Points earned")
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
        // The English value addresses the arguments positionally (label, then period noun).
        #expect(model.capWarnings == [
            "You've hit your Exercise limit for today — this one earns no extra points.",
            "You've hit your Group activity limit for this week — this one earns no extra points.",
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

    // MARK: - Feature-model strings (Leaderboard, Trends, Account, Map): fallback copy plus the
    // VoiceOver sentences the pure helpers build from `LocalDay.display` and `Category.label`.

    @MainActor @Test func leaderboardStringsFollowTheInAppLanguage() async {
        defer { Localized.setLanguage(.vi) }
        let client = FailingClient(error: URLError(.badServerResponse))
        let board = LeaderboardModel(api: client)
        let member = MemberDetailModel(api: client, memberID: "u2")
        let user = UserSummary(id: "u1", displayName: "Khoa", avatarUrl: nil)
        let meRow = LeaderboardRow(rank: 1, user: user, total: 120, weekPoints: 30, isMe: true)
        let otherRow = LeaderboardRow(rank: 2, user: user, total: 90, weekPoints: 10, isMe: false)

        await board.load()
        await member.loadFirstPage()
        #expect(board.state == .failed("Không tải được bảng xếp hạng."))
        #expect(member.errorMessage == "Không tải được hoạt động của thành viên.")
        #expect(LeaderboardRowView.accessibilityLabel(for: meRow) == "Hạng 1, Khoa, bạn, 120 điểm, tuần này 30 điểm")
        #expect(LeaderboardRowView.accessibilityLabel(for: otherRow) == "Hạng 2, Khoa, 90 điểm, tuần này 10 điểm")

        Localized.setLanguage(.en)
        await board.load()
        await member.loadFirstPage()
        #expect(board.state == .failed("Couldn't load the leaderboard."))
        #expect(member.errorMessage == "Couldn't load this member's activity.")
        #expect(LeaderboardRowView.accessibilityLabel(for: meRow) == "Rank 1, Khoa, you, 120 points, 30 points this week")
        #expect(LeaderboardRowView.accessibilityLabel(for: otherRow) == "Rank 2, Khoa, 90 points, 10 points this week")
    }

    @MainActor @Test func trendsStringsFollowTheInAppLanguage() async {
        defer { Localized.setLanguage(.vi) }
        let client = FailingClient(error: URLError(.badServerResponse))
        let trends = TrendsModel(api: client)
        let day = DayEntriesModel(api: client, date: "2026-09-09")
        let active = TrendsModel.HeatCell(date: "2026-09-09", points: 12, weekKey: "2026-W37", weekdayLabel: "T4")
        let inactive = TrendsModel.HeatCell(date: "2026-09-10", points: 0, weekKey: "2026-W37", weekdayLabel: "T5")

        await trends.load()
        await day.load()
        #expect(trends.state == .failed("Không tải được xu hướng."))
        #expect(day.errorMessage == "Không tải được hoạt động của ngày này.")
        #expect(TrendsModel.accessibilityLabel(for: active) == "Thứ Tư, 09/09: 12 điểm")
        #expect(TrendsModel.accessibilityLabel(for: inactive) == "Thứ Năm, 10/09: không hoạt động")

        Localized.setLanguage(.en)
        await trends.load()
        await day.load()
        #expect(trends.state == .failed("Couldn't load trends."))
        #expect(day.errorMessage == "Couldn't load this day's activity.")
        #expect(TrendsModel.accessibilityLabel(for: active) == "Wednesday, 09/09: 12 points")
        #expect(TrendsModel.accessibilityLabel(for: inactive) == "Thursday, 10/09: no activity")
    }

    /// The heatmap's domain values stay `T2…CN` in every language (they are cell identities the
    /// tap gesture maps back); only the axis text follows the picker.
    @MainActor @Test func trendsAxisLabelsFollowTheInAppLanguage() {
        defer { Localized.setLanguage(.vi) }
        #expect(TrendsModel.weekdayLabels.map(TrendsModel.weekdayTitle) == ["T2", "T3", "T4", "T5", "T6", "T7", "CN"])
        #expect(TrendsModel.weekLabel("2026-W37") == "T37")
        #expect(TrendsModel.weekLabel("2026-W05") == "T05")

        Localized.setLanguage(.en)
        #expect(TrendsModel.weekdayLabels.map(TrendsModel.weekdayTitle) == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
        #expect(TrendsModel.weekLabel("2026-W37") == "W37")
        #expect(TrendsModel.weekLabel("2026-W05") == "W05")
    }

    @MainActor @Test func accountHistoryLabelsFollowTheInAppLanguage() {
        defer { Localized.setLanguage(.vi) }
        let active = HistoryEntryDTO(
            id: "e1", userId: "u1", photoUrl: "mock://photo/1", thumbUrl: nil,
            takenAt: Date(), localDate: "2026-09-08", status: .confirmed,
            categories: [.exercise, .meal], placeName: "Phòng gym California", placeSource: .poi,
            createdAt: Date(), points: 5, capped: false
        )
        let capped = HistoryEntryDTO(
            id: "e2", userId: "u1", photoUrl: "mock://photo/2", thumbUrl: nil,
            takenAt: Date(), localDate: "2026-09-08", status: .confirmed,
            categories: [.group], placeName: nil, placeSource: PlaceSource.none,
            createdAt: Date(), points: 0, capped: true
        )
        let empty = HistoryEntryDTO(
            id: "e3", userId: "u1", photoUrl: "mock://photo/3", thumbUrl: nil,
            takenAt: Date(), localDate: "2026-09-08", status: .pending,
            categories: [], placeName: nil, placeSource: PlaceSource.none,
            createdAt: Date(), points: 0, capped: false
        )
        #expect(AccountModel.accessibilityLabel(for: active) ==
                "Thứ Ba, 08/09, Tập luyện, Bữa ăn lành mạnh, Phòng gym California, 5 điểm")
        #expect(AccountModel.accessibilityLabel(for: capped) ==
                "Thứ Ba, 08/09, Hoạt động nhóm, không có địa điểm, 0 điểm, đã đủ giới hạn")
        #expect(AccountModel.accessibilityLabel(for: empty) ==
                "Thứ Ba, 08/09, Chưa chọn hạng mục, không có địa điểm, 0 điểm")

        Localized.setLanguage(.en)
        #expect(AccountModel.accessibilityLabel(for: active) ==
                "Tuesday, 08/09, Exercise, Healthy meal, Phòng gym California, 5 points")
        #expect(AccountModel.accessibilityLabel(for: capped) ==
                "Tuesday, 08/09, Group activity, no place, 0 points, limit reached")
        #expect(AccountModel.accessibilityLabel(for: empty) ==
                "Tuesday, 08/09, No category chosen, no place, 0 points")
    }

    @MainActor @Test func accountModelFailuresFollowTheInAppLanguage() async throws {
        defer { Localized.setLanguage(.vi) }
        let error = URLError(.badServerResponse)
        let history = AccountModel(api: HistoryFailingClient(error: error))
        let profile = AccountModel(api: LeaderboardFailingClient(error: error))
        let deleting = AccountModel(api: MockAPIClient())
        await deleting.loadFirstPage()
        let victim = try #require(deleting.entries.first)
        let deleteFails = AccountModel(api: FailingClient(error: error))

        await history.loadFirstPage()
        await profile.loadFirstPage()
        await deleteFails.delete(victim)
        #expect(history.errorMessage == "Không tải được lịch sử.")
        #expect(profile.errorMessage == "Không tải được hồ sơ.")
        #expect(deleteFails.errorMessage == "Không xoá được, hãy thử lại.")

        Localized.setLanguage(.en)
        await history.loadFirstPage()
        await profile.loadFirstPage()
        await deleteFails.delete(victim)
        #expect(history.errorMessage == "Couldn't load your history.")
        #expect(profile.errorMessage == "Couldn't load your profile.")
        #expect(deleteFails.errorMessage == "Couldn't delete, please try again.")
    }

    @MainActor @Test func profileEditAndFeedbackFailuresFollowTheInAppLanguage() async {
        defer { Localized.setLanguage(.vi) }
        let error = URLError(.badServerResponse)
        let user = UserDTO(id: "u1", firebaseUid: "fb1", displayName: "Khoa", avatarKey: nil,
                           role: .member, status: .active, locale: .vi, createdAt: Date())
        let profile = ProfileEditModel(api: RecordingAPIClient(resultUser: user, updateMeError: error), user: user)
        profile.displayName = "Khoa Mới"
        let feedback = FeedbackModel(api: FailingClient(error: error))
        feedback.message = "Nút xác nhận hơi nhỏ."

        profile.usePickedImage(data: Data("nope".utf8))
        #expect(profile.errorMessage == "Ảnh không hợp lệ, hãy chọn ảnh khác.")
        feedback.useScreenshot(data: Data("nope".utf8))
        #expect(feedback.errorMessage == "Ảnh không hợp lệ, hãy chọn ảnh khác.")
        _ = await profile.save()
        await feedback.send()
        #expect(profile.errorMessage == "Không lưu được, hãy thử lại.")
        #expect(feedback.errorMessage == "Không gửi được góp ý, hãy thử lại.")

        Localized.setLanguage(.en)
        profile.usePickedImage(data: Data("nope".utf8))
        #expect(profile.errorMessage == "That photo isn't valid, pick another one.")
        feedback.useScreenshot(data: Data("nope".utf8))
        #expect(feedback.errorMessage == "That photo isn't valid, pick another one.")
        _ = await profile.save()
        await feedback.send()
        #expect(profile.errorMessage == "Couldn't save, please try again.")
        #expect(feedback.errorMessage == "Couldn't send your feedback, please try again.")
    }

    @MainActor @Test func mapStringsFollowTheInAppLanguage() async {
        defer { Localized.setLanguage(.vi) }
        let map = MapModel(api: FailingClient(error: URLError(.badServerResponse)))
        await map.load()
        #expect(map.state == .failed("Không tải được bản đồ."))
        #expect(Localized.string("\(3) mục ghi") == "3 mục ghi")

        Localized.setLanguage(.en)
        await map.load()
        #expect(map.state == .failed("Couldn't load the map."))
        #expect(Localized.string("\(3) mục ghi") == "3 entries")
    }

    // MARK: - The Account language picker (Task 6): `AppLocale` is the local, three-way choice;
    // the server only ever receives the resolved `UserDTO.Locale`. These flip `Localized`, so
    // they belong in this suite too.

    /// A throwaway `UserDefaults` suite so the choice never leaks into the process-wide defaults
    /// that every other environment in this test run reads from.
    private final class ScratchDefaults {
        let name = "LocalePreferenceTests.\(UUID().uuidString)"
        let defaults: UserDefaults
        init() { defaults = UserDefaults(suiteName: name) ?? .standard }
        deinit { defaults.removePersistentDomain(forName: name) }
    }

    @MainActor @Test func choosingEnglishPatchesTheServerAndMovesTheEnvironment() async throws {
        defer { Localized.setLanguage(.vi) }
        let scratch = ScratchDefaults()
        let client = MockAPIClient()
        let env = AppEnvironment(api: client, auth: MockAuthService(startSignedIn: true), push: stubPush(client),
                                 placeSearch: MockPlaceSearch(), locator: MockLocationFixer(), defaults: scratch.defaults)
        await env.bootstrap()
        #expect(env.currentUser?.locale == .vi)

        await env.setAppLocale(.en)

        #expect(env.appLocale == .en)
        #expect(env.resolvedLocale.identifier.hasPrefix("en"))
        #expect(env.serverLocale == .en)
        #expect(scratch.defaults.string(forKey: AppLocale.storageKey) == "en")
        #expect(Localized.language == .en)
        #expect(Localized.string("Ngôn ngữ") == "Language")
        let me = try await client.me()
        #expect(me.locale == .en)
        #expect(env.currentUser?.locale == .en)
    }

    @MainActor @Test func choosingSystemResolvesFromTheDeviceLanguage() async throws {
        defer { Localized.setLanguage(.vi) }
        let scratch = ScratchDefaults()
        let client = MockAPIClient()
        let env = AppEnvironment(api: client, auth: MockAuthService(startSignedIn: true), push: stubPush(client),
                                 placeSearch: MockPlaceSearch(), locator: MockLocationFixer(), defaults: scratch.defaults)
        await env.bootstrap()
        await env.setAppLocale(.en)

        await env.setAppLocale(.system)

        let device = AppLocale.system.resolved()
        #expect(env.appLocale == .system)
        #expect(env.resolvedLocale.identifier == device.locale.identifier)
        #expect(Localized.language == device)
        #expect(scratch.defaults.string(forKey: AppLocale.storageKey) == "system")
        // `.system` still sends a concrete language so server-side copy has one.
        let me = try await client.me()
        #expect(me.locale == UserDTO.Locale(device))
        #expect(me.locale.rawValue == device.rawValue)
    }

    @MainActor @Test func signingInWithAMismatchedServerLocalePatchesTheServer() async throws {
        defer { Localized.setLanguage(.vi) }
        let scratch = ScratchDefaults()
        scratch.defaults.set(AppLocale.en.rawValue, forKey: AppLocale.storageKey)
        let client = MockAPIClient()   // seeded profile is `vi`
        let env = AppEnvironment(api: client, auth: MockAuthService(startSignedIn: true), push: stubPush(client),
                                 placeSearch: MockPlaceSearch(), locator: MockLocationFixer(), defaults: scratch.defaults)
        #expect(env.appLocale == .en)
        env.activateLocale()
        #expect(Localized.language == .en)

        await env.bootstrap()

        let me = try await client.me()
        #expect(me.locale == .en)
        #expect(env.currentUser?.locale == .en)
        #expect(env.currentUser?.status == .active)
    }

    @MainActor @Test func aFailedPatchLeavesThePreferenceApplied() async throws {
        // A dropped network call must not strand the UI in the old language.
        defer { Localized.setLanguage(.vi) }
        let scratch = ScratchDefaults()
        let client = MockAPIClient(updateMeError: APIError.network(URLError(.notConnectedToInternet)))
        let env = AppEnvironment(api: client, auth: MockAuthService(startSignedIn: true), push: stubPush(client),
                                 placeSearch: MockPlaceSearch(), locator: MockLocationFixer(), defaults: scratch.defaults)
        await env.bootstrap()

        await env.setAppLocale(.en)

        #expect(env.appLocale == .en)
        #expect(Localized.language == .en)
        #expect(Localized.string("Hệ thống") == "System")
        #expect(scratch.defaults.string(forKey: AppLocale.storageKey) == "en")
        let me = try await client.me()
        #expect(me.locale == .vi)
        #expect(env.currentUser?.status == .active)
    }
}
