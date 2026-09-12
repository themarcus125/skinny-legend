import Testing
import UIKit
@testable import SkinnyLegend

@Suite("MainTabView")
@MainActor
struct MainTabViewTests {
    @Test("The Track bubble icon is pre-tinted so the tab bar cannot grey it out when unselected")
    func trackIconKeepsItsColour() {
        let image = TrackTabIcon.image
        #expect(image.renderingMode == .alwaysOriginal)
        #expect(image.size.width > 0 && image.size.height > 0)
    }
}
