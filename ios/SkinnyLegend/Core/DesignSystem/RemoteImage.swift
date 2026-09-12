import SwiftUI

/// Loads an http(s) image with `AsyncImage`. `MockAPIClient` hands out `mock://` URLs instead of
/// real ones so every screen has artwork while the Simulator is fully offline; those render as a
/// deterministic gradient derived from the URL.
struct RemoteImage<Placeholder: View>: View {
    let url: String?
    @ViewBuilder var placeholder: Placeholder

    var body: some View {
        if let url, url.hasPrefix("mock://") {
            MockPhotoTile(seed: url)
        } else if let url, let parsed = URL(string: url) {
            AsyncImage(url: parsed) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                placeholder
            }
        } else {
            placeholder
        }
    }
}

extension RemoteImage where Placeholder == AnyView {
    init(url: String?) {
        self.init(url: url) {
            AnyView(Rectangle().fill(.quaternary))
        }
    }
}

/// Deterministic offline artwork: the URL's hash picks a hue pair.
struct MockPhotoTile: View {
    let seed: String

    var body: some View {
        let hue = Double(abs(seed.hashValue) % 360) / 360
        LinearGradient(
            colors: [
                Color(hue: hue, saturation: 0.55, brightness: 0.92),
                Color(hue: (hue + 0.12).truncatingRemainder(dividingBy: 1), saturation: 0.65, brightness: 0.70),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay(
            Image(systemName: "figure.run")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(.white.opacity(0.65))
        )
    }
}
