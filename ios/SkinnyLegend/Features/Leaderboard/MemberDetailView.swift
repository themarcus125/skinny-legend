import SwiftUI

struct MemberDetailView: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    @State private var model: MemberDetailModel
    private let member: UserSummary
    private let rank: Int
    private let total: Int

    init(api: any APIClient, member: UserSummary, rank: Int, total: Int) {
        self.member = member
        self.rank = rank
        self.total = total
        _model = State(initialValue: MemberDetailModel(api: api, memberID: member.id))
    }

    var body: some View {
        ZStack {
            WarmBackground()
            ScrollView {
                LazyVStack(spacing: 14) {
                    headerCard
                    if model.entries.isEmpty && model.isLoading {
                        ProgressView().padding(.vertical, 24)
                    } else if model.entries.isEmpty {
                        Text(model.errorMessage ?? Localized.string("Thành viên này chưa có hoạt động nào."))
                            .font(.roundedLabel(15, weight: .medium))
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 24)
                    } else {
                        entriesCard
                        if model.hasMore {
                            ProgressView().padding(.vertical, 12)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 120)
            }
        }
        .navigationTitle(member.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task { if model.entries.isEmpty { await model.loadFirstPage() } }
        .refreshable { await model.loadFirstPage() }
    }

    /// One grouped section rather than a card per entry, borrowing the grammar of the Account
    /// history list: a single glass surface whose rows are separated by hairline dividers.
    /// The stack stays lazy so each row's `.task` — and therefore pagination — still fires only
    /// as that row comes into view.
    private var entriesCard: some View {
        GlassCard(padding: 0) {
            LazyVStack(spacing: 0) {
                ForEach(Array(model.entries.enumerated()), id: \.element.id) { index, entry in
                    if index > 0 {
                        Divider().padding(.leading, 16)
                    }
                    MemberEntryRow(entry: entry)
                        .task { await model.loadNextPageIfNeeded(after: entry) }
                }
            }
            // The rows have no background of their own, so clip them to the card's shape
            // rather than letting a thumbnail cross a rounded corner.
            .clipShape(RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
        }
    }

    private var headerCard: some View {
        GlassCard {
            HStack(spacing: 14) {
                AvatarView(url: member.avatarUrl, displayName: member.displayName, size: 56)
                VStack(alignment: .leading, spacing: 2) {
                    Text(member.displayName)
                        .font(.roundedLabel(20, weight: .bold))
                    Text("Hạng \(rank)")
                        .font(.roundedLabel(13, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                BigNumber(value: total, size: 34)
            }
        }
    }
}

private struct MemberEntryRow: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    let entry: EntryDTO

    var body: some View {
        HStack(spacing: 14) {
            RemoteImage(url: entry.thumbUrl ?? entry.photoUrl)
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            VStack(alignment: .leading, spacing: 6) {
                Text(LocalDay.display(entry.localDate))
                    .font(.roundedLabel(15, weight: .bold))
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
        }
        // No glass of its own: the enclosing `GlassCard` is the single surface for every row.
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}
