import SwiftUI
import Testing
@testable import SkinnyLegend

@Suite("SignInBackground")
struct SignInBackgroundTests {
    @Test("Plays video when motion is allowed and the asset exists")
    func video() {
        #expect(SignInBackground.mode(reduceMotion: false, assetAvailable: true) == .video)
    }
    @Test("Falls back to the gradient under Reduce Motion")
    func reduceMotion() {
        #expect(SignInBackground.mode(reduceMotion: true, assetAvailable: true) == .gradient)
    }
    @Test("Falls back to the gradient when the asset is missing")
    func missingAsset() {
        #expect(SignInBackground.mode(reduceMotion: false, assetAvailable: false) == .gradient)
    }
    @Test("The bundled asset is present")
    func assetBundled() {
        #expect(SignInBackground.assetURL != nil)
    }
}

@Suite("SignInView text colour")
struct SignInViewTextColorTests {
    @Test("White over the video's dark gradient")
    func video() {
        #expect(SignInView.textColor(for: .video) == .white)
        #expect(SignInView.secondaryTextColor(for: .video) == .white.opacity(0.85))
    }
    @Test("Default palette over the warm gradient")
    func gradient() {
        #expect(SignInView.textColor(for: .gradient) == .primary)
        #expect(SignInView.secondaryTextColor(for: .gradient) == .secondary)
    }
}
