import SwiftUI

/// Circular avatar; falls back to the member's initials on a category-free flame tint.
struct AvatarView: View {
    let url: String?
    let displayName: String
    var size: CGFloat = 40

    var body: some View {
        RemoteImage(url: url) {
            ZStack {
                Circle().fill(Theme.flame.opacity(0.22))
                Text(initials)
                    .font(.roundedLabel(size * 0.4, weight: .bold))
                    .foregroundStyle(Theme.flame)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var initials: String {
        let words = displayName.split(separator: " ")
        let letters = words.suffix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }
}
