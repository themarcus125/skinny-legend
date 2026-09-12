import SwiftUI

/// A headline numeral in SF Rounded heavy, animating between values.
struct BigNumber: View {
    let value: Int
    var size: CGFloat = 64
    var tint: Color = Theme.flame

    var body: some View {
        Text("\(value)")
            .font(.numerals(size))
            .foregroundStyle(tint)
            .contentTransition(.numericText(value: Double(value)))
            .monospacedDigit()
    }
}

/// A compact "+5 điểm" pill used on entry rows and the verdict sheet.
struct PointsBadge: View {
    let points: Int
    var isCapped: Bool = false

    var body: some View {
        Text(points > 0 ? "+\(points)" : "0")
            .font(.numerals(15))
            .foregroundStyle(points > 0 ? Theme.flame : Color.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .glassEffect(.regular, in: Capsule())
            .opacity(isCapped ? 0.6 : 1)
    }
}
