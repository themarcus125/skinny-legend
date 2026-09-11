import SwiftUI

/// A padded Liquid Glass surface. Layout and padding are applied before `.glassEffect`,
/// as the Liquid Glass guidance requires.
struct GlassCard<Content: View>: View {
    var padding: CGFloat = 18
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
    }
}
