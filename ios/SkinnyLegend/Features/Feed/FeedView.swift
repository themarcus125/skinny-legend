import SwiftUI

/// Spec §7: group entries with photo, author, categories and place name. Coordinates are never
/// shown — only `placeName` (spec §8 step 7).
struct FeedView: View {
    @State private var model: FeedModel
    private let api: any APIClient

    init(api: any APIClient) {
        self.api = api
        _model = State(initialValue: FeedModel(api: api))
    }

    var body: some View {
        ZStack {
            WarmBackground()
            if model.entries.isEmpty && model.isLoading {
                ProgressView()
            } else if model.entries.isEmpty, let errorMessage = model.errorMessage {
                ContentUnavailableView {
                    Label("Không tải được", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Thử lại") { Task { await model.loadFirstPage() } }
                        .buttonStyle(.glassProminent)
                }
            } else if model.entries.isEmpty {
                ContentUnavailableView("Chưa có hoạt động nào", systemImage: "photo.stack",
                                       description: Text("Khi cả nhóm ghi nhận hoạt động, chúng sẽ xuất hiện ở đây."))
            } else {
                list
            }
        }
        .navigationTitle("Nhật ký nhóm")
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
                            .font(.roundedLabel(15, weight: .bold))
                        Text(LocalDay.display(entry.localDate))
                            .font(.roundedLabel(12, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }

                GlassEffectContainer(spacing: 8) {
                    FlowLayout(spacing: 8, rowSpacing: 8) {
                        ForEach(entry.categories) { category in
                            CategoryChip(category: category)
                        }
                    }
                }

                if let placeName = entry.placeName {
                    Label(placeName, systemImage: "mappin.circle.fill")
                        .font(.roundedLabel(13, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(16)
        }
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
    }
}
