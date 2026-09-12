import SwiftUI

/// A tinted glass capsule for one scoring category.
/// `isOn == false` renders as a plain outline so an un-selected chip never reads as an active state.
/// Interactive glass is used only when an `action` exists.
struct CategoryChip: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
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
                .lineLimit(1)
            if isCapped {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.ember)
            }
        }
        .foregroundStyle(isOn ? Color.primary : Color.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        // Chip rows sit in tight HStacks that can squeeze a chip below its label's natural width;
        // without this the label wraps mid-word ("Tập luyệ / n") instead of the row wrapping onto
        // a second line. `FlowLayout` (Core/DesignSystem/FlowLayout.swift) is what makes room for
        // that second line at each call site.
        .fixedSize(horizontal: true, vertical: false)
    }
}
