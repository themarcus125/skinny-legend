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
                    .foregroundStyle(LinearGradient(colors: [Theme.ember, Theme.flame], startPoint: .top, endPoint: .bottom))
                    .symbolEffect(.bounce, value: appeared)
                Text(points > 0 ? "+\(points)" : "0")
                    .font(.numerals(52))
                    .foregroundStyle(Theme.flame)
                Text(points > 0 ? "Đã ghi nhận, giữ chuỗi nhé!" : "Đã ghi nhận")
                    .font(.roundedLabel(17, weight: .bold))
            }
            .padding(36)
            .glassEffect(.regular.tint(Theme.flame.opacity(0.28)), in: RoundedRectangle(cornerRadius: 32, style: .continuous))
            .scaleEffect(appeared ? 1 : 0.5)
            .opacity(appeared ? 1 : 0)
        }
        .sensoryFeedback(.success, trigger: appeared)
        .onAppear {
            withAnimation(.spring(duration: 0.45, bounce: 0.45)) { appeared = true }
        }
    }
}
