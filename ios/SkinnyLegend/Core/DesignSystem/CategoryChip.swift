import SwiftUI

/// One scoring category as the design system's badge/achievement chip: a soft tint derived from
/// the semantic set (`info-soft` / `success-soft` / `primary-soft`) with the matching strong
/// colour for the glyph and label. `isOn == false` is the "locked" variant — an outline on
/// `surface2` — so an un-selected chip never reads as an active state.
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
            // The chip itself is ~30 pt tall, which is below the 44 pt minimum tap target. The
            // visual stays compact — a taller pill would break the chip rows — and instead sits
            // centred in a 44 pt hit frame that `contentShape` makes tappable edge to edge.
            Button(action: action) {
                label
                    .frame(minHeight: Theme.ControlHeight.md)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            label
        }
    }

    private var label: some View {
        HStack(spacing: Theme.Space.x1 + 2) {
            Image(systemName: isOn ? category.symbol : "circle")
                .font(.system(size: 12, weight: .bold))
            Text(category.shortLabel)
                .typeStyle(.caption)
                .lineLimit(1)
            if isCapped {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.warning)
            }
        }
        // `fgMuted`, not `fgSubtle`: the locked chip's label is read, not decoration
        // (`fgSubtle` is 3.51:1 on `surface2` territory in light; `fgMuted` is 5.96:1).
        .foregroundStyle(isOn ? category.tint : Theme.fgMuted)
        .padding(.horizontal, Theme.Space.x3 - 2)
        .padding(.vertical, Theme.Space.x2 - 1)
        .background(isOn ? category.softTint : Theme.surface2, in: Capsule())
        .overlay { Capsule().strokeBorder(isOn ? Color.clear : Theme.border, lineWidth: 1) }
        // Chip rows sit in tight HStacks that can squeeze a chip below its label's natural width;
        // without this the label wraps mid-word ("Tập luyệ / n") instead of the row wrapping onto
        // a second line. `FlowLayout` (Core/DesignSystem/FlowLayout.swift) is what makes room for
        // that second line at each call site.
        .fixedSize(horizontal: true, vertical: false)
    }
}
