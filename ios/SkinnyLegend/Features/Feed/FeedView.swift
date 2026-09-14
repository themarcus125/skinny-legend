import SwiftUI

/// Spec §7: group entries with photo, author, categories and place name. Coordinates are never
/// shown — only `placeName` (spec §8 step 7).
struct FeedView: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    @State private var model: FeedModel
    /// Second half of the "Bản đồ" quick action (`AppRoute.map`): `DashboardView` pushed this
    /// screen because the flag was up, and this consumes it to push the map on top.
    @State private var isMapPushed = false
    private let router = PushRouter.shared
    private let api: any APIClient

    init(api: any APIClient) {
        self.api = api
        _model = State(initialValue: FeedModel(api: api))
    }

    var body: some View {
        ZStack {
            AppBackground()
            if model.entries.isEmpty && model.isLoading {
                ProgressView()
            } else if model.entries.isEmpty, let errorMessage = model.errorMessage {
                ContentUnavailableView {
                    Label("Không tải được", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Thử lại") { Task { await model.loadFirstPage() } }
                        .buttonStyle(.ds(.primary, size: .md))
                }
                .emptyStateStyle()
            } else if model.entries.isEmpty {
                ContentUnavailableView("Chưa có hoạt động nào", systemImage: "photo.stack",
                                       description: Text("Khi cả nhóm ghi nhận hoạt động, chúng sẽ xuất hiện ở đây."))
                    .emptyStateStyle()
            } else {
                list
            }
        }
        // A `String` title on purpose: a `LocalizedStringKey` title is bridged to the navigation bar
        // once and never re-resolves when the in-app language changes; this one is recomputed
        // because the view declares `@Environment(\.locale)`.
        .navigationTitle(Localized.string("Nhật ký nhóm"))
        .navigationDestination(isPresented: $isMapPushed) { MapScreen(api: api) }
        // Consumed once, so navigating back to the feed by hand does not push the map again.
        .onAppear { if router.consumeMap() { isMapPushed = true } }
        .task { if model.entries.isEmpty { await model.loadFirstPage() } }
        .refreshable { await model.loadFirstPage() }
        .toolbar {
            NavigationLink {
                MapScreen(api: api)
            } label: {
                Label("Bản đồ", systemImage: "map")
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(model.entries) { entry in
                    FeedRow(entry: entry)
                        .task { await model.loadNextPageIfNeeded(after: entry) }
                }
                if model.hasMore {
                    ProgressView().padding(.vertical, 12)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 120)
        }
    }
}

private struct FeedRow: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    let entry: FeedEntryDTO

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RemoteImage(url: entry.thumbUrl ?? entry.photoUrl)
                .frame(height: 200)
                .frame(maxWidth: .infinity)
                .clipped()

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    AvatarView(url: entry.user.avatarUrl, displayName: entry.user.displayName, size: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(entry.user.displayName)
                            .typeStyle(.h3)
                            .foregroundStyle(Theme.fg)
                        Text(LocalDay.display(entry.localDate))
                            .typeStyle(.caption)
                            .foregroundStyle(Theme.fgMuted)
                    }
                    Spacer()
                }

                FlowLayout(spacing: 8, rowSpacing: 8) {
                    ForEach(entry.categories) { category in
                        CategoryChip(category: category)
                    }
                }

                if let placeName = entry.placeName {
                    Label(placeName, systemImage: "mappin.circle.fill")
                        .typeStyle(.caption)
                        .foregroundStyle(Theme.fgMuted)
                        .lineLimit(1)
                }
            }
            .padding(16)
        }
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous)
                .strokeBorder(Theme.border, lineWidth: 1)
        }
        .elevation(.e1)
    }
}
