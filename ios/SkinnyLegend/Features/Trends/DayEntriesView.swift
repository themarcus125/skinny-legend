import SwiftUI

struct DayEntriesView: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    @State private var model: DayEntriesModel

    init(api: any APIClient, date: LocalDate) {
        _model = State(initialValue: DayEntriesModel(api: api, date: date))
    }

    var body: some View {
        ZStack {
            WarmBackground()
            if model.isLoading && model.entries.isEmpty {
                ProgressView()
            } else if model.entries.isEmpty {
                ContentUnavailableView(
                    "Không có hoạt động",
                    systemImage: "calendar.badge.exclamationmark",
                    description: Text(model.errorMessage ?? Localized.string("Ngày này bạn chưa ghi nhận hoạt động nào."))
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: 14) {
                        ForEach(model.entries) { entry in
                            HStack(spacing: 14) {
                                RemoteImage(url: entry.thumbUrl ?? entry.photoUrl)
                                    .frame(width: 72, height: 72)
                                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                VStack(alignment: .leading, spacing: 6) {
                                    GlassEffectContainer(spacing: 6) {
                                        FlowLayout(spacing: 6, rowSpacing: 6) {
                                            ForEach(entry.categories) { category in
                                                CategoryChip(category: category)
                                            }
                                        }
                                    }
                                    if let placeName = entry.placeName {
                                        Label(placeName, systemImage: "mappin.circle.fill")
                                            .font(.roundedLabel(12, weight: .medium))
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer()
                                PointsBadge(points: entry.points, isCapped: entry.capped)
                            }
                            .padding(14)
                            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 120)
                }
            }
        }
        .navigationTitle(LocalDay.display(model.date))
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
    }
}
