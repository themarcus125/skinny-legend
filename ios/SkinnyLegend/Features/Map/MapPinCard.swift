import SwiftUI

/// Detail sheet for a single map pin. `FeedRow` (Features/Feed/FeedView.swift) is `private` with
/// no tap target of its own, so this rebuilds the same visual grammar — photo, author, categories,
/// place — as a standalone `GlassCard` sheet instead of reusing it.
struct MapPinCard: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    let pin: MapPinDTO

    var body: some View {
        ScrollView {
            card
                .padding(20)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    /// Scrolls inside the sheet: a 16:9 photo, header, wrapped chips and place can exceed the
    /// medium detent on smaller devices.
    private var card: some View {
        GlassCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                RemoteImage(url: pin.thumbUrl)
                    .aspectRatio(16.0 / 9.0, contentMode: .fill)
                    .frame(maxWidth: .infinity)
                    .clipped()

                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        AvatarView(url: pin.user.avatarUrl, displayName: pin.user.displayName, size: 34)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(pin.user.displayName)
                                .font(.roundedLabel(15, weight: .bold))
                            Text(LocalDay.display(pin.localDate))
                                .font(.roundedLabel(12, weight: .medium))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }

                    GlassEffectContainer(spacing: 8) {
                        FlowLayout(spacing: 8, rowSpacing: 8) {
                            ForEach(pin.categories) { category in
                                CategoryChip(category: category)
                            }
                        }
                    }

                    if let placeName = pin.placeName {
                        Label(placeName, systemImage: "mappin.circle.fill")
                            .font(.roundedLabel(13, weight: .medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                .padding(16)
            }
        }
    }
}
