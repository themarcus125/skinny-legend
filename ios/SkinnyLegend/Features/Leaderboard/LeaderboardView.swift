import SwiftUI

/// Spec §7: ranked list with avatar, total and weekly delta; tapping a member opens their entries.
struct LeaderboardView: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    @State private var model: LeaderboardModel
    private let apiClient: any APIClient

    init(api: any APIClient) {
        self.apiClient = api
        _model = State(initialValue: LeaderboardModel(api: api))
    }

    var body: some View {
        ZStack {
            AppBackground()
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
                        .buttonStyle(.ds(.primary, size: .md))
                }
                .emptyStateStyle()
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
        // A `String` title on purpose: a `LocalizedStringKey` title is bridged to the navigation bar
        // once and never re-resolves when the in-app language changes; this one is recomputed
        // because the view declares `@Environment(\.locale)`.
        .navigationTitle(Localized.string("Xếp hạng"))
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}

struct LeaderboardRowView: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    let row: LeaderboardRow

    var body: some View {
        HStack(spacing: Theme.Space.x3) {
            Text("\(row.rank)")
                .font(.numerals(22))
                .monospacedDigit()
                .foregroundStyle(medalTint)
                .frame(width: 30, alignment: .center)

            AvatarView(url: row.user.avatarUrl, displayName: row.user.displayName, size: 44)

            VStack(alignment: .leading, spacing: Theme.Space.x1 - 2) {
                HStack(spacing: Theme.Space.x2 - 2) {
                    Text(row.user.displayName)
                        .typeStyle(.h3)
                        .foregroundStyle(Theme.fg)
                        .lineLimit(1)
                    if row.isMe { youPill }
                }
                Text("Tuần này +\(row.weekPoints)")
                    .typeStyle(.caption)
                    .foregroundStyle(Theme.fgMuted)
            }

            Spacer(minLength: Theme.Space.x2)

            BigNumber(value: row.total, size: 26)

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.fgSubtle)
        }
        .padding(Theme.Space.x4)
        .background(row.isMe ? Theme.primarySoft : Theme.surface, in: shape)
        .overlay { shape.strokeBorder(row.isMe ? Theme.primaryBorder : Theme.border, lineWidth: 1) }
        .elevation(.e1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Self.accessibilityLabel(for: row))
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous)
    }

    /// The "YOU" pill from the leaderboard-row spec: the label type role (11 / 600 / +6% /
    /// uppercase) on the accent.
    private var youPill: some View {
        Text("BẠN")
            .typeStyle(.label)
            .foregroundStyle(Theme.fgOnAccent)
            .padding(.horizontal, Theme.Space.x2)
            .padding(.vertical, Theme.Space.x1 - 1)
            .background(Theme.primary, in: Capsule())
    }

    private var medalTint: Color {
        switch row.rank {
        case 1: Theme.warning
        case 2, 3: Theme.fgMuted
        default: Theme.fgSubtle
        }
    }

    /// Pure helper so the VoiceOver label is unit-testable without rendering a view. Two
    /// whole-sentence catalog keys rather than a spliced ", bạn" fragment, so each language
    /// reads as one sentence.
    static func accessibilityLabel(for row: LeaderboardRow) -> String {
        row.isMe
            ? Localized.string("Hạng \(row.rank), \(row.user.displayName), bạn, \(row.total) điểm, tuần này \(row.weekPoints) điểm")
            : Localized.string("Hạng \(row.rank), \(row.user.displayName), \(row.total) điểm, tuần này \(row.weekPoints) điểm")
    }
}
