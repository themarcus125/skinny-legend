import SwiftUI

/// Button sizes from the token table. `md` is the iOS 44 pt minimum tap target; `lg` is the
/// full-width call to action.
enum ButtonSize: Sendable {
    case sm
    case md
    case lg

    var height: CGFloat {
        switch self {
        case .sm: Theme.ControlHeight.sm
        case .md: Theme.ControlHeight.md
        case .lg: Theme.ControlHeight.lg
        }
    }

    var radius: CGFloat {
        switch self {
        case .sm: Theme.Radius.sm
        case .md: Theme.Radius.md
        // `lg` is the full-width call to action; radius `lg` is what the sign-in screen's Apple
        // button is clipped to, and the two have to match.
        case .lg: Theme.Radius.lg
        }
    }

    var horizontalPadding: CGFloat {
        switch self {
        case .sm: Theme.Space.x3
        case .md: Theme.Space.x4
        case .lg: Theme.Space.x6
        }
    }

    var style: TypeStyle {
        switch self {
        case .sm: .caption
        case .md, .lg: .bodyMedium
        }
    }
}

/// The four button variants: primary (ink CTA), secondary, ghost, destructive. States are
/// default / pressed ("active") / disabled / loading — the caller signals loading by disabling
/// the button and putting a `ProgressView` in the label, exactly as the existing screens do.
enum ButtonVariant: Sendable {
    case primary
    case secondary
    case ghost
    case destructive
}

struct DesignSystemButtonStyle: ButtonStyle {
    let variant: ButtonVariant
    var size: ButtonSize = .md
    /// `true` stretches the button across its container (the full-width CTAs).
    var isFullWidth = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        configuration.label
            .typeStyle(size.style)
            .foregroundStyle(foreground)
            .frame(maxWidth: isFullWidth ? .infinity : nil)
            .frame(height: size.height)
            .padding(.horizontal, size.horizontalPadding)
            .background(background(pressed: pressed), in: shape)
            .overlay { shape.strokeBorder(border, lineWidth: borderWidth) }
            .opacity(isEnabled ? 1 : 0.45)
            .contentShape(shape)
            .animation(.easeOut(duration: 0.12), value: pressed)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: size.radius, style: .continuous)
    }

    private var foreground: Color {
        switch variant {
        case .primary: Theme.fgOnAccent
        case .secondary: Theme.fg
        case .ghost: Theme.primary
        case .destructive: Theme.destructiveFg
        }
    }

    private func background(pressed: Bool) -> Color {
        switch variant {
        case .primary: pressed ? Theme.primaryActive : Theme.primary
        case .secondary: pressed ? Theme.surface2 : Theme.surface
        case .ghost: pressed ? Theme.surface2 : .clear
        case .destructive: pressed ? Theme.destructiveActive : Theme.destructive
        }
    }

    private var border: Color {
        switch variant {
        case .primary, .destructive, .ghost: .clear
        case .secondary: Theme.borderStrong
        }
    }

    private var borderWidth: CGFloat { variant == .secondary ? 1 : 0 }
}

extension ButtonStyle where Self == DesignSystemButtonStyle {
    /// Ink call to action (vanilla in dark).
    static var dsPrimary: DesignSystemButtonStyle { DesignSystemButtonStyle(variant: .primary) }
    static var dsSecondary: DesignSystemButtonStyle { DesignSystemButtonStyle(variant: .secondary) }
    static var dsGhost: DesignSystemButtonStyle { DesignSystemButtonStyle(variant: .ghost) }
    static var dsDestructive: DesignSystemButtonStyle { DesignSystemButtonStyle(variant: .destructive) }

    static func ds(_ variant: ButtonVariant, size: ButtonSize = .md, fullWidth: Bool = false) -> DesignSystemButtonStyle {
        DesignSystemButtonStyle(variant: variant, size: size, isFullWidth: fullWidth)
    }
}
