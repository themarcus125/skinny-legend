import Testing
import Foundation
@testable import SkinnyLegend

@Suite("LocalDay")
struct LocalDayTests {
    @Test("Formats an instant in Asia/Ho_Chi_Minh, not UTC")
    func formatsInChallengeTimezone() throws {
        // 2026-09-11T18:30:00Z is 2026-09-12 01:30 in Asia/Ho_Chi_Minh (UTC+7).
        let instant = try Date("2026-09-11T18:30:00Z", strategy: .iso8601)
        #expect(LocalDay.string(from: instant) == "2026-09-12")
    }

    @Test("Adds and subtracts days across a month boundary")
    func addsDays() {
        #expect(LocalDay.adding(1, to: "2026-09-30") == "2026-10-01")
        #expect(LocalDay.adding(-1, to: "2026-10-01") == "2026-09-30")
        #expect(LocalDay.adding(7, to: "2026-09-08") == "2026-09-15")
    }

    @Test("ISO week keys start on Monday")
    func isoWeekKeys() {
        #expect(LocalDay.isoWeekKey("2026-09-07") == "2026-W37")  // Monday
        #expect(LocalDay.isoWeekKey("2026-09-08") == "2026-W37")  // Tuesday, challenge start
        #expect(LocalDay.isoWeekKey("2026-09-13") == "2026-W37")  // Sunday
        #expect(LocalDay.isoWeekKey("2026-09-14") == "2026-W38")  // next Monday
        #expect(LocalDay.isoWeekKey("2026-01-01") == "2026-W01")
    }

    @Test("weekdayIndex is 0 for Monday and 6 for Sunday")
    func weekdayIndex() {
        #expect(LocalDay.weekdayIndex("2026-09-07") == 0)
        #expect(LocalDay.weekdayIndex("2026-09-13") == 6)
    }

    @Test("each produces an inclusive ascending range")
    func eachDay() {
        #expect(LocalDay.each(from: "2026-09-08", to: "2026-09-11") == ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"])
        #expect(LocalDay.each(from: "2026-09-11", to: "2026-09-08").isEmpty)
    }

    @Test("display renders the weekday in the given locale, then day/month")
    func displayUsesVietnameseWeekdayNames() {
        #expect(LocalDay.display("2026-09-08", locale: Locale(identifier: "vi_VN")) == "Thứ Ba, 08/09")
        #expect(LocalDay.display("2026-09-13", locale: Locale(identifier: "vi_VN")) == "Chủ Nhật, 13/09")
    }

    @Test("display renders English weekday names under an English locale")
    func displayUsesEnglishWeekdayNamesUnderEn() {
        #expect(LocalDay.display("2026-09-08", locale: Locale(identifier: "en_US")) == "Tuesday, 08/09")
        #expect(LocalDay.display("2026-09-13", locale: Locale(identifier: "en_US")) == "Sunday, 13/09")
    }

    @Test("weekdaySymbol maps the Monday-first index onto Sunday-first Foundation symbols")
    func weekdaySymbolIsMondayFirst() {
        let en = Locale(identifier: "en_US")
        #expect(LocalDay.weekdaySymbol(0, locale: en) == "Monday")
        #expect(LocalDay.weekdaySymbol(6, locale: en) == "Sunday")
    }

    @Test("display without a locale follows the in-app language, which defaults to Vietnamese")
    func displayDefaultsToTheAppLanguage() {
        #expect(LocalDay.display("2026-09-08") == "Thứ Ba, 08/09")
    }
}
