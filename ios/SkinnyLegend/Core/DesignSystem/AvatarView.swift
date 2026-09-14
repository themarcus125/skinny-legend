import SwiftUI

/// Circular avatar; falls back to the member's initials on the accent soft tint.
struct AvatarView: View {
    let url: String?
    let displayName: String
    var size: CGFloat = 40

    var body: some View {
        RemoteImage(url: url) {
            ZStack {
                Circle().fill(Theme.primarySoft)
                Text(initials)
                    .font(.brand(size * 0.4, weight: .bold))
                    .foregroundStyle(Theme.fg)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        // Hairline ring: the initials fallback is `primary-soft`, which would otherwise vanish
        // on the leaderboard's own accent-soft "you" row.
        .overlay { Circle().strokeBorder(Theme.primaryBorder, lineWidth: 1) }
    }

    private var initials: String {
        let words = displayName.split(separator: " ")
        let letters = words.suffix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }
}
