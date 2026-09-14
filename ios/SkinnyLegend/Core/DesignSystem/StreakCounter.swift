import SwiftUI

/// The streak, shown as a flame with its count (spec §14). The flame breathes only while the
/// streak is alive so a broken streak reads as visually inert.
struct StreakFlame: View {
    let days: Int
    var size: CGFloat = 34

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "flame.fill")
                .font(.system(size: size, weight: .bold))
                .foregroundStyle(days > 0 ? AnyShapeStyle(LinearGradient(colors: [Theme.ember, Theme.flame], startPoint: .top, endPoint: .bottom)) : AnyShapeStyle(Color.secondary.opacity(0.4)))
                .symbolEffect(.breathe, isActive: days > 0)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(days)")
                    .font(.numerals(size))
                    .contentTransition(.numericText(value: Double(days)))
                Text("ngày liên tiếp")
                    .font(.roundedLabel(12, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Chuỗi \(days) ngày liên tiếp")
    }
}
