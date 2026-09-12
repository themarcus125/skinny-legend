import SwiftUI
import UIKit

/// Playful-fitness palette (spec §14): one vivid "flame" accent over a soft warm ground,
/// plus one tint per scoring category. Every colour is defined dynamically so dark mode works.
enum Theme {
    static let flame = dynamic(light: (1.00, 0.42, 0.21), dark: (1.00, 0.52, 0.31))
    static let ember = dynamic(light: (1.00, 0.70, 0.25), dark: (1.00, 0.76, 0.38))
    static let exercise = dynamic(light: (0.20, 0.55, 1.00), dark: (0.40, 0.68, 1.00))
    static let meal = dynamic(light: (0.11, 0.66, 0.40), dark: (0.28, 0.80, 0.54))
    static let group = dynamic(light: (0.62, 0.36, 0.98), dark: (0.74, 0.53, 1.00))
    static let warmTop = dynamic(light: (1.00, 0.95, 0.90), dark: (0.11, 0.09, 0.12))
    static let warmBottom = dynamic(light: (0.97, 0.92, 0.98), dark: (0.06, 0.07, 0.11))

    static let cardCornerRadius: CGFloat = 24

    private static func dynamic(light: (Double, Double, Double), dark: (Double, Double, Double)) -> Color {
        Color(uiColor: UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1)
        })
    }
}

/// The app's single background. Every root screen puts this behind its content so the
/// system glass materials have something warm to refract.
struct WarmBackground: View {
    var body: some View {
        LinearGradient(
            colors: [Theme.warmTop, Theme.warmBottom],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

extension Font {
    /// SF Rounded, heavy — the only face used for numerals (spec §14).
    static func numerals(_ size: CGFloat) -> Font {
        .system(size: size, weight: .heavy, design: .rounded)
    }

    static func roundedLabel(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}
