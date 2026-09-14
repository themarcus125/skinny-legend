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
            AppBackground()
            ScrollView {
                LazyVStack(spacing: 14) {
                    headerCard
                    if model.entries.isEmpty && model.isLoading {
                        ProgressView().padding(.vertical, 24)
                    } else if model.entries.isEmpty {
                        Text(model.errorMessage ?? Localized.string("Thành viên này chưa có hoạt động nào."))
                            .typeStyle(.bodyMedium)
                            .foregroundStyle(Theme.fgMuted)
                            .padding(.vertical, 24)
                    } else {
                        entriesCard
                        if model.hasMore {
                            // The one pagination trigger: a footer in the *outer* lazy stack, so
                            // it is built only when the reader reaches the end of what is loaded.
                            // `.id(count)` re-identifies it after each page, which re-fires the
                            // task while it is still on screen (a short history keeps filling)
                            // and stops as soon as it scrolls away or `hasMore` turns false.
                            ProgressView()
                                .padding(.vertical, 12)
                                .id(model.entries.count)
                                .task { await model.loadNextPage() }
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
    /// The rows carry no pagination of their own — a nested lazy stack inside a card can lay out
    /// more than it shows, so the trigger lives on the footer of the outer stack instead.
    private var entriesCard: some View {
        SurfaceCard(padding: 0) {
            LazyVStack(spacing: 0) {
                ForEach(Array(model.entries.enumerated()), id: \.element.id) { index, entry in
                    if index > 0 {
                        Divider().overlay(Theme.border).padding(.leading, Theme.Space.x4)
                    }
                    MemberEntryRow(entry: entry)
                }
            }
            // The rows have no background of their own, so clip them to the card's shape
            // rather than letting a thumbnail cross a rounded corner.
            .clipShape(RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
        }
    }

    private var headerCard: some View {
        SurfaceCard {
            HStack(spacing: 14) {
                AvatarView(url: member.avatarUrl, displayName: member.displayName, size: 56)
                VStack(alignment: .leading, spacing: 2) {
                    Text(member.displayName)
                        .typeStyle(.h2)
                        .foregroundStyle(Theme.fg)
                    Text("Hạng \(rank)")
                        .typeStyle(.caption)
                        .foregroundStyle(Theme.fgMuted)
                }
                Spacer()
                BigNumber(value: total, size: 30)
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
                    .typeStyle(.h3)
                    .foregroundStyle(Theme.fg)
                FlowLayout(spacing: 6, rowSpacing: 6) {
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
            Spacer()
        }
        // No glass of its own: the enclosing `SurfaceCard` is the single surface for every row.
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}
