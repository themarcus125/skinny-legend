import Foundation

/// A calendar day in the challenge timezone, formatted `YYYY-MM-DD`, exactly as the API sends it.
typealias LocalDate = String

/// All local-day arithmetic happens in `Asia/Ho_Chi_Minh` on an ISO-8601 calendar
/// (Monday-start weeks), matching the server (spec §2, §5).
enum LocalDay {
    static let timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = timeZone
        calendar.locale = Locale(identifier: "vi_VN")
        return calendar
    }

    static func string(from date: Date) -> LocalDate {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Noon is used as the wall-clock anchor so DST-style shifts can never move the day.
    static func date(from day: LocalDate) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        components.hour = 12
        return calendar.date(from: components)
    }

    static func adding(_ days: Int, to day: LocalDate) -> LocalDate {
        guard let anchor = date(from: day), let moved = calendar.date(byAdding: .day, value: days, to: anchor) else {
            return day
        }
        return string(from: moved)
    }

    /// `2026-W37` — same shape the server's `isoWeekKey` produces.
    static func isoWeekKey(_ day: LocalDate) -> String {
        guard let anchor = date(from: day) else { return day }
        let parts = calendar.dateComponents([.weekOfYear, .yearForWeekOfYear], from: anchor)
        return String(format: "%04d-W%02d", parts.yearForWeekOfYear ?? 0, parts.weekOfYear ?? 0)
    }

    /// 0 = Monday … 6 = Sunday. Used as the heatmap's row index.
    static func weekdayIndex(_ day: LocalDate) -> Int {
        guard let anchor = date(from: day) else { return 0 }
        // Calendar.component(.weekday) is 1 = Sunday … 7 = Saturday.
        return (calendar.component(.weekday, from: anchor) + 5) % 7
    }

    static func each(from: LocalDate, to: LocalDate) -> [LocalDate] {
        guard from <= to else { return [] }
        var days: [LocalDate] = []
        var cursor = from
        while cursor <= to {
            days.append(cursor)
            cursor = adding(1, to: cursor)
        }
        return days
    }

    /// Weekday symbols come from the *display* locale, not from the challenge calendar — the
    /// calendar above is pinned to `vi_VN`/Asia/Ho_Chi_Minh for arithmetic only (spec §2).
    private static func symbolFormatter(_ locale: Locale) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = Calendar(identifier: .iso8601)
        return formatter
    }

    /// 0 = Monday … 6 = Sunday, localized. `DateFormatter.weekdaySymbols` is Sunday-first.
    /// Defaults to the in-app language (`Localized.locale`), not the device's, so the picker
    /// re-localises every section header built from it.
    static func weekdaySymbol(_ index: Int, locale: Locale = Localized.locale) -> String {
        let symbols = symbolFormatter(locale).weekdaySymbols ?? []
        guard symbols.count == 7 else { return "" }
        return symbols[(index + 1) % 7]
    }

    /// `Thứ Ba, 08/09` in Vietnamese, `Tuesday, 08/09` in English — the section header used in
    /// history and the feed.
    static func display(_ day: LocalDate, locale: Locale = Localized.locale) -> String {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return day }
        let weekday = weekdaySymbol(weekdayIndex(day), locale: locale)
        return "\(weekday), \(String(format: "%02d/%02d", parts[2], parts[1]))"
    }

    static var today: LocalDate { string(from: Date()) }
}
