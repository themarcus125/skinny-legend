import SwiftUI

/// Spec §14: celebratory haptic + morph when an entry confirms.
struct CelebrationOverlay: View {
    let points: Int
    @State private var appeared = false

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.black.opacity(0.28))
                .ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 80, weight: .bold))
                    .foregroundStyle(Theme.primary)
                    .symbolEffect(.bounce, value: appeared)
                Text(points > 0 ? "+\(points)" : "0")
                    .font(.numerals(44))
                    .tracking(-1.5)
                    .foregroundStyle(Theme.fg)
                Text(points > 0 ? "Đã ghi nhận, giữ chuỗi nhé!" : "Đã ghi nhận")
                    .typeStyle(.h3)
                    .foregroundStyle(Theme.fgMuted)
            }
            .padding(Theme.Space.x8)
            .background(Theme.elevated, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .strokeBorder(Theme.border, lineWidth: 1)
            }
            .elevation(.e3)
            .scaleEffect(appeared ? 1 : 0.5)
            .opacity(appeared ? 1 : 0)
        }
        .sensoryFeedback(.success, trigger: appeared)
        .onAppear {
            withAnimation(.spring(duration: 0.45, bounce: 0.45)) { appeared = true }
        }
    }
}
