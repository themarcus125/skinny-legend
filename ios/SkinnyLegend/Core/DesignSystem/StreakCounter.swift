import SwiftUI

/// The design system's "streak counter": a display-weight number, the "ngày liên tiếp" caption,
/// the previous-best line, and a row of seven dots for the current streak week.
///
/// The dots are derived, not new data: the rulebook pays a streak bonus every
/// `Rulebook.streakLength` days (7), so `filledDots` is simply where the current streak sits
/// inside that cycle — a full row means the bonus has just landed.
struct StreakCounter: View {
    /// Declared so this body re-runs when the Account picker changes the language. Unlike
    /// `CategoryChip`, nothing here goes through `Localized` — every string is a
    /// `LocalizedStringKey` — but the counter is rendered inside cards whose parents SwiftUI can
    /// skip re-evaluating, so the dependency is declared rather than assumed.
    @Environment(\.locale) private var locale
    let days: Int
    let longest: Int
    var numberSize: CGFloat = 40

    /// How many of the seven dots are lit. A live streak whose length is an exact multiple of
    /// seven shows a full row (the bonus day itself) rather than an empty one.
    static func filledDots(days: Int, cycle: Int = Rulebook.streakLength) -> Int {
        guard days > 0, cycle > 0 else { return 0 }
        let remainder = days % cycle
        return remainder == 0 ? cycle : remainder
    }

    private var isAlive: Bool { days > 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.x2) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Space.x2) {
                Text("\(days)")
                    .font(.numerals(numberSize))
                    .foregroundStyle(isAlive ? Theme.primary : Theme.fgSubtle)
                    .contentTransition(.numericText(value: Double(days)))
                    .monospacedDigit()
                Text("ngày liên tiếp")
                    .typeStyle(.caption)
                    .foregroundStyle(Theme.fgMuted)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Chuỗi \(days) ngày liên tiếp")

            Text("Dài nhất: \(longest) ngày")
                .typeStyle(.caption)
                .foregroundStyle(Theme.fgSubtle)

            dots
        }
    }

    private var dots: some View {
        let filled = Self.filledDots(days: days)
        return HStack(spacing: Theme.Space.x1 + 2) {
            ForEach(0..<Rulebook.streakLength, id: \.self) { index in
                Circle()
                    .fill(index < filled ? Theme.primary : Theme.track)
                    .frame(width: 8, height: 8)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(filled) trên 7 ngày của chuỗi hiện tại")
    }
}
