import SwiftUI
import UIKit

/// The Operation Skinny Legend design system, transcribed from `docs/design-system/tokens.md`
/// (accent **Vanilla**, light and dark both shipping).
///
/// Every colour is a dynamic `UIColor`, so the whole app follows the system appearance without a
/// single `colorScheme` check in a view body. The hybrid-glass rule: native iOS 26 Liquid Glass
/// stays on system chrome only (tab bar, navigation bars, sheet chrome); everything in content —
/// cards, buttons, chips, rows, progress, alerts, empty states — uses these flat ink/tint
/// surfaces with the system's own shadows (`Elevation`).
enum Theme {

    // MARK: - Surfaces

    static let bg = dynamic(light: 0xEDECF1, dark: 0x171717)
    static let surface = dynamic(light: 0xFBFAFD, dark: 0x232325)
    static let surface2 = dynamic(light: 0xF3F2F7, dark: 0x2B2B2E)
    static let elevated = dynamic(light: 0xFFFFFF, dark: 0x2F2F32)
    static let border = dynamic(light: 0xE4E3EB, dark: 0x3A3A3E)
    static let borderStrong = dynamic(light: 0xCFCED9, dark: 0x4C4C52)
    /// The unfilled remainder of a progress ring or bar.
    static let track = dynamic(light: 0xE4E3EB, dark: 0x3A3A3E)

    // MARK: - Foreground

    static let fg = dynamic(light: 0x212121, dark: 0xF6F5FA)
    static let fgMuted = dynamic(light: 0x5C5C63, dark: 0xB4B4BB)
    /// Decoration only (dividers, empty-state marks, inert glyphs): 3.51:1 on `surface` in
    /// light. Anything a reader actually reads — eyebrows, sub-lines, section headers — takes
    /// `fgMuted` (6.38:1 on `surface`) instead.
    static let fgSubtle = dynamic(light: 0x85858F, dark: 0x8A8A93)
    /// Text and glyphs drawn *on* `primary`.
    static let fgOnAccent = dynamic(light: 0xF6F5FA, dark: 0x212121)

    // MARK: - Accent (ink in light, vanilla in dark)

    static let primary = dynamic(light: 0x212121, dark: 0xEFF0A3)
    static let primaryHover = dynamic(light: 0x333338, dark: 0xF5F6BE)
    static let primaryActive = dynamic(light: 0x0E0E0E, dark: 0xDEDF90)
    static let primarySoft = dynamic(light: 0xEFF0A3, dark: 0x3A3B24)
    static let primaryBorder = dynamic(light: 0xE0E18C, dark: 0x55562F)

    // MARK: - Semantic

    /// Light `success`/`warning` are the *accessibility* values from tokens.md's deviation
    /// table, not the raw spec ones: at 11/600 on their own soft fill the spec inks land just
    /// under WCAG AA (4.27:1 and 4.33:1), so both clients shift them one step darker inside the
    /// same hue (5.23:1 and 5.58:1). The dark counterparts already pass and are unchanged.
    static let success = dynamic(light: 0x3F5D43, dark: 0xA9C6A4)
    static let successSoft = dynamic(light: 0xCFDECA, dark: 0x2C3A2B)
    static let warning = dynamic(light: 0x6F5412, dark: 0xE0C57E)
    static let warningSoft = dynamic(light: 0xF1E4B0, dark: 0x3A3122)
    static let destructive = dynamic(light: 0xA63B34, dark: 0xE4A09A)
    static let destructiveHover = dynamic(light: 0x8E2F29, dark: 0xEDB4AF)
    static let destructiveActive = dynamic(light: 0x77251F, dark: 0xD28C86)
    static let destructiveSoft = dynamic(light: 0xF1DAD8, dark: 0x3C2725)
    static let destructiveFg = dynamic(light: 0xFFFFFF, dark: 0x212121)
    static let info = dynamic(light: 0x48607F, dark: 0xAABCD5)
    static let infoSoft = dynamic(light: 0xD8DFE9, dark: 0x262E3A)

    // MARK: - Radius

    enum Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 12
        static let lg: CGFloat = 18
        /// Pill. Use `Capsule()` where a shape is wanted.
        static let full: CGFloat = 999
    }

    /// Cards are radius `lg`.
    static let cardCornerRadius = Radius.lg

    // MARK: - Space (4 / 8 grid)

    enum Space {
        static let x1: CGFloat = 4
        static let x2: CGFloat = 8
        static let x3: CGFloat = 12
        static let x4: CGFloat = 16
        static let x6: CGFloat = 24
        static let x8: CGFloat = 32
        static let x12: CGFloat = 48
    }

    // MARK: - Button heights

    enum ControlHeight {
        static let sm: CGFloat = 32
        /// The iOS minimum tap target.
        static let md: CGFloat = 44
        static let lg: CGFloat = 54
    }

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

// MARK: - Elevation

/// `--sh1` / `--sh2` / `--sh3` from the token table. Each is two stacked shadows in CSS; SwiftUI
/// takes them as two `.shadow` modifiers, and the opacities differ per theme (dark shadows are
/// much heavier), so the values are read through the environment's colour scheme.
enum Elevation {
    /// Card.
    case e1
    /// Sheet / popover.
    case e2
    /// Modal.
    case e3
}

/// One CSS shadow layer. SwiftUI's `radius` is half the CSS blur, hence the halved values below.
struct ShadowLayer: Sendable {
    let opacity: Double
    let radius: CGFloat
    let y: CGFloat
}

extension Elevation {
    /// The two stacked layers of `--sh1` / `--sh2` / `--sh3`, per theme.
    func layers(isDark: Bool) -> [ShadowLayer] {
        switch self {
        case .e1:
            return isDark
                ? [ShadowLayer(opacity: 0.5, radius: 1, y: 1)]
                : [ShadowLayer(opacity: 0.06, radius: 1, y: 1), ShadowLayer(opacity: 0.04, radius: 0.5, y: 1)]
        case .e2:
            return isDark
                ? [ShadowLayer(opacity: 0.55, radius: 7, y: 4), ShadowLayer(opacity: 0.4, radius: 1.5, y: 1)]
                : [ShadowLayer(opacity: 0.08, radius: 7, y: 4), ShadowLayer(opacity: 0.05, radius: 1.5, y: 1)]
        case .e3:
            return isDark
                ? [ShadowLayer(opacity: 0.65, radius: 22, y: 18), ShadowLayer(opacity: 0.45, radius: 5, y: 3)]
                : [ShadowLayer(opacity: 0.14, radius: 22, y: 18), ShadowLayer(opacity: 0.06, radius: 5, y: 3)]
        }
    }
}

private struct ElevationModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    let level: Elevation

    func body(content: Content) -> some View {
        let isDark = colorScheme == .dark
        // Light shadows are cast in Eerie Black (the token table's `rgba(33,33,33,…)`); dark ones
        // in pure black.
        let ink = isDark ? Color.black : Color(red: 33 / 255, green: 33 / 255, blue: 33 / 255)
        return level.layers(isDark: isDark).reduce(AnyView(content)) { view, layer in
            AnyView(view.shadow(color: ink.opacity(layer.opacity), radius: layer.radius, y: layer.y))
        }
    }
}

extension View {
    /// The design system's `--sh1` / `--sh2` / `--sh3`.
    func elevation(_ level: Elevation) -> some View {
        modifier(ElevationModifier(level: level))
    }
}

// MARK: - Background

/// The app's single background: the flat `bg` token. Every root screen puts this behind its
/// content, so the system glass on the tab bar and navigation bars has something to refract.
struct AppBackground: View {
    var body: some View {
        Theme.bg.ignoresSafeArea()
    }
}

// MARK: - Typography

extension Font {
    /// The app's text face: **Be Vietnam Pro** (`Resources/Fonts/BeVietnamPro-*.ttf`, OFL), a
    /// family designed for Vietnamese — the reason it replaced the design page's Urbanist, which
    /// has no coverage for the stacked diacritics (ổ, ữ, ặ…) the copy is full of.
    ///
    /// Five static faces ship, one per design-system weight (400/500/600/700/800); anything else
    /// rounds to the nearest of those.
    static func brand(size: CGFloat, weight: Font.Weight = .medium) -> Font {
        Font(BrandFont.uiFont(size: size, weight: weight))
    }

    /// Shorthand used across the app; the design system's own roles are below.
    static func brand(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        brand(size: size, weight: weight)
    }
}

/// Resolves one of the bundled Be Vietnam Pro faces by PostScript name, falling back to the
/// system font at the same weight if it is missing (an unregistered `UIAppFonts` entry, say)
/// rather than crashing or silently rendering Times.
enum BrandFont {
    static let familyName = "Be Vietnam Pro"

    /// PostScript name per design-system weight. Only these five faces are bundled.
    static func postScriptName(for weight: Font.Weight) -> String {
        switch weight {
        case .ultraLight, .thin, .light, .regular: "BeVietnamPro-Regular"
        case .medium: "BeVietnamPro-Medium"
        case .semibold: "BeVietnamPro-SemiBold"
        case .bold: "BeVietnamPro-Bold"
        case .heavy, .black: "BeVietnamPro-ExtraBold"
        default: "BeVietnamPro-Regular"
        }
    }

    static func uiFont(size: CGFloat, weight: Font.Weight) -> UIFont {
        UIFont(name: postScriptName(for: weight), size: size)
            ?? .systemFont(ofSize: size, weight: uiWeight(for: weight))
    }

    private static func uiWeight(for weight: Font.Weight) -> UIFont.Weight {
        switch weight {
        case .ultraLight: .ultraLight
        case .thin: .thin
        case .light: .light
        case .regular: .regular
        case .medium: .medium
        case .semibold: .semibold
        case .bold: .bold
        case .heavy: .heavy
        case .black: .black
        default: .regular
        }
    }

    /// Every face the app expects `UIAppFonts` to have registered.
    static let bundledFaces = [
        "BeVietnamPro-Regular",
        "BeVietnamPro-Medium",
        "BeVietnamPro-SemiBold",
        "BeVietnamPro-Bold",
        "BeVietnamPro-ExtraBold",
    ]

    /// True once `UIAppFonts` has registered every bundled face.
    static var isRegistered: Bool {
        bundledFaces.allSatisfy { UIFont(name: $0, size: 12) != nil }
    }
}

/// The type scale from the token table. Tracking and case are part of the role, so they are
/// applied together with the font by `typeStyle(_:)`.
///
/// The table's line-heights are deliberately not transcribed: SwiftUI has no direct
/// line-height control (`lineSpacing` adds to leading rather than setting it), and iOS defers
/// to Be Vietnam Pro's own natural leading, which is what every screen is laid out against.
enum TypeStyle: Sendable {
    /// 44 / 800 / -3.5%
    case display
    /// 30 / 700
    case h1
    /// 22 / 650 — the family ships no 650 face, so this takes the nearer 700 Bold, which also
    /// keeps h2 visibly heavier than h3's 600.
    case h2
    /// 17 / 600
    case h3
    /// 16 / 400
    case body
    /// 16 / 500
    case bodyMedium
    /// 13 / 500
    case caption
    /// 11 / 600 / +6% / uppercase
    case label

    var size: CGFloat {
        switch self {
        case .display: 44
        case .h1: 30
        case .h2: 22
        case .h3: 17
        case .body, .bodyMedium: 16
        case .caption: 13
        case .label: 11
        }
    }

    var weight: Font.Weight {
        switch self {
        case .display: .heavy        // 800
        case .h1, .h2: .bold         // 700
        case .h3, .label: .semibold  // 600
        case .body: .regular         // 400
        case .bodyMedium, .caption: .medium  // 500
        }
    }

    /// Letter spacing, as a fraction of the size.
    var tracking: CGFloat {
        switch self {
        case .display: -0.035 * size
        case .label: 0.06 * size
        default: 0
        }
    }

    var isUppercased: Bool { self == .label }

    var font: Font { .brand(size: size, weight: weight) }
}

extension View {
    /// Applies one role of the design system's type scale (font, tracking and case).
    ///
    /// `nonisolated` on purpose: this has to be usable inside the `@Sendable`, non-isolated
    /// label builders of controls such as `PhotosPicker`.
    nonisolated func typeStyle(_ style: TypeStyle) -> some View {
        font(style.font)
            .tracking(style.tracking)
            .textCase(style.isUppercased ? .uppercase : nil)
    }
}

extension Font {
    /// The numeral face: the brand family at the display weight, for `BigNumber` and friends.
    static func numerals(_ size: CGFloat) -> Font {
        .brand(size: size, weight: .heavy)
    }
}
