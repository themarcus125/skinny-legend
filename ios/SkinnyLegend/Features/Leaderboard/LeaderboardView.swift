import SwiftUI

/// Spec §7: ranked list with avatar, total and weekly delta; tapping a member opens their entries.
struct LeaderboardView: View {
    @State private var model: LeaderboardModel
    private let apiClient: any APIClient

    init(api: any APIClient) {
        self.apiClient = api
        _model = State(initialValue: LeaderboardModel(api: api))
    }

    var body: some View {
        ZStack {
            WarmBackground()
            switch model.state {
            case .loading:
                ProgressView()
            case .failed(let message):
                ContentUnavailableView {
                    Label("Không tải được", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Thử lại") { Task { await model.load() } }
                        .buttonStyle(.glassProminent)
                }
            case .loaded(let rows):
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(rows) { row in
                            NavigationLink {
                                MemberDetailView(api: apiClient, member: row.user, rank: row.rank, total: row.total)
                            } label: {
                                LeaderboardRowView(row: row)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 120)
                }
            }
        }
        .navigationTitle("Xếp hạng")
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}

private struct LeaderboardRowView: View {
    let row: LeaderboardRow

    var body: some View {
        HStack(spacing: 14) {
            Text("\(row.rank)")
                .font(.numerals(22))
                .foregroundStyle(medalTint)
                .frame(width: 34, alignment: .center)

            AvatarView(url: row.user.avatarUrl, displayName: row.user.displayName, size: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(row.user.displayName)
                    .font(.roundedLabel(17, weight: .bold))
                Text("Tuần này +\(row.weekPoints)")
                    .font(.roundedLabel(13, weight: .medium))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            BigNumber(value: row.total, size: 30)

            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .glassEffect(
            row.isMe ? .regular.tint(Theme.flame.opacity(0.30)) : .regular,
            in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous)
        )
    }

    private var medalTint: Color {
        switch row.rank {
        case 1: Theme.ember
        case 2, 3: Theme.flame.opacity(0.75)
        default: Color.secondary
        }
    }
}
