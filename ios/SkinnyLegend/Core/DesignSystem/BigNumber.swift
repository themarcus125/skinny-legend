import SwiftUI

/// A headline numeral in the brand face at the display weight (800), animating between values.
/// Sized at the design system's `display` (44) or `h1` (30) by the call site.
struct BigNumber: View {
    let value: Int
    var size: CGFloat = 44
    var tint: Color = Theme.primary

    var body: some View {
        Text("\(value)")
            .font(.numerals(size))
            .tracking(-0.035 * size)
            .foregroundStyle(tint)
            .contentTransition(.numericText(value: Double(value)))
            .monospacedDigit()
    }
}

/// A compact "+5" pill used on entry rows and the verdict sheet — the design system's
/// badge chip in its accent (`primary-soft`) variant.
struct PointsBadge: View {
    let points: Int
    var isCapped: Bool = false

    var body: some View {
        Text(points > 0 ? "+\(points)" : "0")
            .font(.numerals(15))
            .monospacedDigit()
            .foregroundStyle(points > 0 ? Theme.fg : Theme.fgSubtle)
            .padding(.horizontal, Theme.Space.x3 - 2)
            .padding(.vertical, Theme.Space.x1 + 1)
            .background(points > 0 ? Theme.primarySoft : Theme.surface2, in: Capsule())
            .overlay {
                Capsule().strokeBorder(points > 0 ? Theme.primaryBorder : Theme.border, lineWidth: 1)
            }
            .opacity(isCapped ? 0.6 : 1)
    }
}
