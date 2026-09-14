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

    @Test("Buttons never fall below the 44 pt tap target, except the explicitly compact sm")
    func buttonHeights() {
        #expect(ButtonSize.md.height == 44)
        #expect(ButtonSize.lg.height == 54)
        #expect(ButtonSize.sm.height == 32)
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
