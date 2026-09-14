import SwiftUI

/// The design system's card: a flat `surface` panel, hairline `border`, radius `lg`, elevation
/// `e1`. Liquid Glass is deliberately *not* used here — under the hybrid rule glass belongs to
/// system chrome (tab bar, navigation bars, sheet chrome) and content sits on flat ink surfaces.
struct SurfaceCard<Content: View>: View {
    var padding: CGFloat = Theme.Space.x4 + 2
    /// `surface` by default; the accent milestone card passes `Theme.primarySoft`.
    var background: Color = Theme.surface
    var border: Color = Theme.border
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(background, in: shape)
            .overlay { shape.strokeBorder(border, lineWidth: 1) }
            .elevation(.e1)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous)
    }
}

/// An inline alert / error banner: soft tint, matching strong colour for the icon and text.
struct AlertBanner: View {
    enum Kind {
        case success
        case info
        case warning
        case destructive

        var tint: Color {
            switch self {
            case .success: Theme.success
            case .info: Theme.info
            case .warning: Theme.warning
            case .destructive: Theme.destructive
            }
        }

        var soft: Color {
            switch self {
            case .success: Theme.successSoft
            case .info: Theme.infoSoft
            case .warning: Theme.warningSoft
            case .destructive: Theme.destructiveSoft
            }
        }

        var symbol: String {
            switch self {
            case .success: "checkmark.circle.fill"
            case .info: "info.circle.fill"
            case .warning: "exclamationmark.triangle.fill"
            case .destructive: "exclamationmark.octagon.fill"
            }
        }
    }

    let kind: Kind
    let message: String
    var symbol: String?

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Space.x2 + 2) {
            Image(systemName: symbol ?? kind.symbol)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(kind.tint)
            Text(message)
                .typeStyle(.caption)
                .foregroundStyle(kind.tint)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Theme.Space.x3)
        .padding(.vertical, Theme.Space.x3 - 2)
        .background(kind.soft, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// The empty-state spec: the system's `ContentUnavailableView` re-typed and re-coloured onto the
/// design system's palette, so it no longer reads as raw UIKit grey inside a token'd screen.
private struct EmptyStateStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .foregroundStyle(Theme.fgMuted)
            .symbolRenderingMode(.hierarchical)
            .tint(Theme.primary)
            .frame(maxWidth: .infinity)
    }
}

extension View {
    /// Applies the design system's empty-state / error-state styling to a `ContentUnavailableView`.
    func emptyStateStyle() -> some View {
        modifier(EmptyStateStyle())
    }
}
