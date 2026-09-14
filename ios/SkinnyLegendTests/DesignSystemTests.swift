import CoreText
import SwiftUI
import Testing
import UIKit
@testable import SkinnyLegend

/// Guards the things about the design system that can silently fail at runtime rather than at
/// compile time: the bundled faces registering at all, each weight resolving to its own face
/// rather than one shared fallback, and — the reason Be Vietnam Pro replaced the design page's
/// Urbanist — the Vietnamese diacritics actually having glyphs.
@Suite("Design system")
@MainActor
struct DesignSystemTests {
    @Test("UIAppFonts registered all five bundled Be Vietnam Pro faces")
    func brandFaceIsRegistered() {
        #expect(BrandFont.isRegistered)
        #expect(BrandFont.uiFont(size: 16, weight: .regular).familyName == BrandFont.familyName)
        #expect(BrandFont.uiFont(size: 16, weight: .heavy).fontName == "BeVietnamPro-ExtraBold")
    }

    @Test("Each design-system weight resolves to its own face, and heavier really is wider")
    func weightsResolveToDistinctFaces() {
        let names = [Font.Weight.regular, .medium, .semibold, .bold, .heavy]
            .map { BrandFont.uiFont(size: 16, weight: $0).fontName }
        #expect(Set(names).count == 5)
        let sample = "Skinny Legend"
        let regular = sample.size(withAttributes: [.font: BrandFont.uiFont(size: 40, weight: .regular)]).width
        let heavy = sample.size(withAttributes: [.font: BrandFont.uiFont(size: 40, weight: .heavy)]).width
        #expect(regular > 0)
        #expect(heavy > regular)
    }

    /// The whole reason for the family swap: every Vietnamese letter the UI uses must come from
    /// Be Vietnam Pro itself, not from a system fallback substituted glyph by glyph.
    @Test("Vietnamese diacritics have real glyphs in every bundled weight")
    func vietnameseCoverage() {
        let sample = "Tổng quan Tài khoản ăâđêôơư ạảãấầẩẫậ ệ ỉ ọ ợ ụ ữ ỵ"
        for weight in [Font.Weight.regular, .medium, .semibold, .bold, .heavy] {
            let font = BrandFont.uiFont(size: 17, weight: weight)
            let attributed = NSAttributedString(string: sample, attributes: [.font: font])
            let line = CTLineCreateWithAttributedString(attributed)
            let runs = CTLineGetGlyphRuns(line) as NSArray
            for case let run as CTRun in runs {
                let attributes = CTRunGetAttributes(run) as NSDictionary
                let used = attributes[kCTFontAttributeName] as! CTFont
                #expect(CTFontCopyPostScriptName(used) as String == font.fontName,
                        "\(weight) fell back to \(CTFontCopyPostScriptName(used) as String)")
            }
        }
    }

    @Test("Every type role maps to its documented size and weight")
    func typeScaleMatchesTheTokenTable() {
        #expect(TypeStyle.display.size == 44 && TypeStyle.display.weight == .heavy)
        #expect(TypeStyle.h1.size == 30 && TypeStyle.h1.weight == .bold)
        #expect(TypeStyle.h2.size == 22 && TypeStyle.h2.weight == .bold)
        #expect(TypeStyle.h3.size == 17 && TypeStyle.h3.weight == .semibold)
        #expect(TypeStyle.body.size == 16 && TypeStyle.body.weight == .regular)
        #expect(TypeStyle.bodyMedium.size == 16 && TypeStyle.bodyMedium.weight == .medium)
        #expect(TypeStyle.caption.size == 13 && TypeStyle.caption.weight == .medium)
        #expect(TypeStyle.label.size == 11 && TypeStyle.label.weight == .semibold)
        #expect(TypeStyle.label.isUppercased)
        #expect(TypeStyle.display.tracking < 0)
    }

    /// The token table's three control heights. `sm` (32 pt) is the one that does not clear the
    /// 44 pt minimum tap target, so it is reserved for non-interactive chrome — every button and
    /// chip the user actually taps takes `md` or `lg`, or nests its compact visual inside an
    /// `md`-tall hit frame the way `CategoryChip` does.
    @Test("Control heights match the token table, and only the non-tappable sm sits under 44 pt")
    func controlHeights() {
        #expect(ButtonSize.md.height == Theme.ControlHeight.md)
        #expect(ButtonSize.lg.height == Theme.ControlHeight.lg)
        #expect(ButtonSize.sm.height == Theme.ControlHeight.sm)
        #expect(Theme.ControlHeight.md == 44)
        #expect(Theme.ControlHeight.lg == 54)
        #expect(Theme.ControlHeight.sm == 32)
        #expect(Theme.ControlHeight.sm < 44)
    }

    /// The `fgSubtle` rule from tokens.md, as a test: it is decoration only, so anything a reader
    /// reads uses `fgMuted`. Measured in light, where the gap actually matters.
    @Test("fgMuted clears WCAG AA on every content surface, and fgSubtle does not")
    func readableForegroundContrast() {
        let light = UITraitCollection(userInterfaceStyle: .light)
        for surface in [Theme.surface, Theme.surface2, Theme.bg, Theme.elevated, Theme.primarySoft] {
            let ratio = contrastRatio(UIColor(Theme.fgMuted).resolvedColor(with: light),
                                      UIColor(surface).resolvedColor(with: light))
            #expect(ratio >= 4.5, "fgMuted only reached \(ratio):1")
        }
        let subtle = contrastRatio(UIColor(Theme.fgSubtle).resolvedColor(with: light),
                                   UIColor(Theme.surface).resolvedColor(with: light))
        #expect(subtle < 4.5)
    }

    /// The two documented deviations from the spec palette (docs/design-system/tokens.md), which
    /// the admin already ships: the light semantic inks sit at 11/600 on their own soft fill,
    /// where the raw spec values land just under AA.
    @Test("The light success and warning inks clear AA on their soft fills")
    func semanticInksClearAA() {
        let light = UITraitCollection(userInterfaceStyle: .light)
        let pairs = [(Theme.success, Theme.successSoft), (Theme.warning, Theme.warningSoft)]
        for (ink, fill) in pairs {
            let ratio = contrastRatio(UIColor(ink).resolvedColor(with: light),
                                      UIColor(fill).resolvedColor(with: light))
            #expect(ratio >= 4.5, "only reached \(ratio):1")
        }
    }

    /// WCAG 2.1 relative luminance.
    private func contrastRatio(_ a: UIColor, _ b: UIColor) -> Double {
        let high = max(luminance(a), luminance(b))
        let low = min(luminance(a), luminance(b))
        return (high + 0.05) / (low + 0.05)
    }

    private func luminance(_ color: UIColor) -> Double {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        func channel(_ c: CGFloat) -> Double {
            let v = Double(c)
            return v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    @Test("The tokens resolve to different colours in light and dark")
    func tokensAreThemeAware() {
        let light = UITraitCollection(userInterfaceStyle: .light)
        let dark = UITraitCollection(userInterfaceStyle: .dark)
        for token in [Theme.bg, Theme.surface, Theme.fg, Theme.primary, Theme.border] {
            let uiColor = UIColor(token)
            #expect(uiColor.resolvedColor(with: light) != uiColor.resolvedColor(with: dark))
        }
    }

    /// The seven dots on the streak card are derived from the rulebook's 7-day bonus cycle, so
    /// they must never read "0 of 7" on a live streak or light a dot on a dead one.
    @Test("The streak dots follow the 7-day bonus cycle")
    func streakDots() {
        #expect(StreakCounter.filledDots(days: 0) == 0)
        #expect(StreakCounter.filledDots(days: 1) == 1)
        #expect(StreakCounter.filledDots(days: 6) == 6)
        #expect(StreakCounter.filledDots(days: 7) == 7)
        #expect(StreakCounter.filledDots(days: 8) == 1)
        #expect(StreakCounter.filledDots(days: 14) == 7)
    }
}
