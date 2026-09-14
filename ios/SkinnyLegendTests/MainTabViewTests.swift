import SwiftUI
import Testing
import UIKit
@testable import SkinnyLegend

@Suite("MainTabView")
@MainActor
struct MainTabViewTests {
    @Test("The Track bubble icon is pre-tinted so the tab bar cannot grey it out when unselected")
    func trackIconKeepsItsColour() {
        for scheme in [ColorScheme.light, .dark] {
            let image = TrackTabIcon.image(for: scheme)
            #expect(image.renderingMode == .alwaysOriginal)
            #expect(image.size.width > 0 && image.size.height > 0)
        }
    }

    /// `Theme.primary` is ink in light and vanilla in dark, and `withTintColor` bakes the colour
    /// in — so one shared image would freeze whichever appearance was active when the glyph was
    /// first built. There is a rendering per appearance instead, picked from the environment.
    @Test("The Track bubble icon has a distinct rendering per appearance, not one frozen colour")
    func trackIconFollowsTheAppearance() {
        let light = TrackTabIcon.image(for: .light)
        let dark = TrackTabIcon.image(for: .dark)
        #expect(light !== dark)
        #expect(light.pngData() != dark.pngData())
        // And they really are the two accent values, not two renderings of the same ink.
        #expect(UIColor(Theme.primary).resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
                != UIColor(Theme.primary).resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark)))
    }
}
