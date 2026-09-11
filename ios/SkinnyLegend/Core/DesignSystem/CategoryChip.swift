import SwiftUI

/// A tinted glass capsule for one scoring category.
/// `isOn == false` renders as a plain outline so an un-selected chip never reads as an active state.
/// Interactive glass is used only when an `action` exists.
struct CategoryChip: View {
    let category: Category
    var isOn: Bool = true
    var isCapped: Bool = false
    var action: (() -> Void)?

    var body: some View {
        if let action {
            Button(action: action) { label }
                .buttonStyle(.plain)
                .glassEffect(glass.interactive(), in: Capsule())
        } else {
            label.glassEffect(glass, in: Capsule())
        }
    }

    private var glass: Glass {
        isOn ? .regular.tint(category.tint.opacity(0.55)) : .regular
    }

    private var label: some View {
        HStack(spacing: 6) {
            Image(systemName: isOn ? category.symbol : "circle")
                .font(.system(size: 13, weight: .bold))
            Text(category.shortLabel)
                .font(.roundedLabel(14))
            if isCapped {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.ember)
            }
        }
        .foregroundStyle(isOn ? Color.primary : Color.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
    }
}
