import SwiftUI

/// Spec §7: today's points, streak counter, delta vs yesterday, rank, and a checklist of what
/// can still score today.
struct DashboardView: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    @State private var model: DashboardModel
    /// First half of the "Bản đồ" quick action (`AppRoute.map`): the router raises the flag,
    /// this pushes the group feed, and `FeedView` consumes the flag to push the map.
    @State private var isFeedPushed = false
    private let router = PushRouter.shared
    private let apiClient: any APIClient

    init(api: any APIClient) {
        self.apiClient = api
        _model = State(initialValue: DashboardModel(api: api))
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
            case .loaded(let dashboard):
                content(dashboard)
            }
        }
        // A `String` title on purpose: a `LocalizedStringKey` title is bridged to the navigation bar
        // once and never re-resolves when the in-app language changes; this one is recomputed
        // because the view declares `@Environment(\.locale)`.
        .navigationTitle(Localized.string("Tổng quan"))
        .navigationDestination(isPresented: $isFeedPushed) { FeedView(api: apiClient) }
        // `onAppear` covers a cold launch, where the quick action is routed before this view
        // exists; `onChange` covers a long-press while the app is already on this tab.
        .onAppear { if router.isMapRequested { isFeedPushed = true } }
        .onChange(of: router.isMapRequested) { _, isRequested in
            if isRequested { isFeedPushed = true }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    private func content(_ dashboard: DashboardDTO) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                todayCard(dashboard)
                HStack(spacing: 16) {
                    streakCard(dashboard)
                    rankCard(dashboard)
                }
                checklistCard(dashboard)
                totalCard(dashboard)
                NavigationLink {
                    FeedView(api: apiClient)
                } label: {
                    SurfaceCard {
                        HStack {
                            Label("Nhật ký nhóm", systemImage: "photo.stack")
                                .typeStyle(.h3)
                                .foregroundStyle(Theme.fg)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Theme.fgSubtle)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 120)
        }
    }

    private func todayCard(_ dashboard: DashboardDTO) -> some View {
        SurfaceCard(padding: Theme.Space.x6) {
            VStack(alignment: .leading, spacing: Theme.Space.x2) {
                Text("Điểm hôm nay")
                    .typeStyle(.label)
                    .foregroundStyle(Theme.fgMuted)
                HStack(alignment: .firstTextBaseline, spacing: Theme.Space.x3) {
                    BigNumber(value: dashboard.today.points, size: 44)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Điểm hôm nay: \(dashboard.today.points)")
                    deltaBadge(dashboard.deltaVsYesterday)
                }
                if dashboard.today.categories.isEmpty {
                    Text("Chưa ghi nhận hoạt động nào hôm nay.")
                        .typeStyle(.caption)
                        .foregroundStyle(Theme.fgMuted)
                } else {
                    FlowLayout(spacing: Theme.Space.x2, rowSpacing: Theme.Space.x2) {
                        ForEach(dashboard.today.categories) { category in
                            CategoryChip(category: category)
                        }
                    }
                    .padding(.top, Theme.Space.x1)
                }
            }
        }
    }

    private func deltaBadge(_ delta: Int) -> some View {
        Label(
            deltaCaption(delta),
            systemImage: delta > 0 ? "arrow.up.right" : delta < 0 ? "arrow.down.right" : "equal"
        )
        .typeStyle(.caption)
        .foregroundStyle(delta > 0 ? Theme.success : delta < 0 ? Theme.destructive : Theme.fgSubtle)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(delta == 0 ? "Bằng hôm qua" : delta > 0 ? "Hơn hôm qua \(delta) điểm" : "Kém hôm qua \(-delta) điểm")
    }

    /// Two explicit catalog keys (`+%lld so với hôm qua` / `%lld so với hôm qua`) rather than an
    /// interpolated sign, so both languages read naturally; a negative delta carries its own minus.
    private func deltaCaption(_ delta: Int) -> LocalizedStringKey {
        if delta == 0 { return "bằng hôm qua" }
        return delta > 0 ? "+\(delta) so với hôm qua" : "\(delta) so với hôm qua"
    }

    private func streakCard(_ dashboard: DashboardDTO) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: Theme.Space.x3) {
                Text("Chuỗi ngày")
                    .typeStyle(.label)
                    .foregroundStyle(Theme.fgMuted)
                StreakCounter(days: dashboard.streak.current, longest: dashboard.streak.longest, numberSize: 30)
            }
        }
    }

    private func rankCard(_ dashboard: DashboardDTO) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: Theme.Space.x3) {
                Text("Thứ hạng")
                    .typeStyle(.label)
                    .foregroundStyle(Theme.fgMuted)
                HStack(alignment: .firstTextBaseline, spacing: Theme.Space.x1) {
                    BigNumber(value: dashboard.rank, size: 30)
                    Text("/ \(dashboard.memberCount)")
                        .typeStyle(.h3)
                        .foregroundStyle(Theme.fgMuted)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Xếp hạng \(dashboard.rank) trên \(dashboard.memberCount)")
                Text("trong nhóm")
                    .typeStyle(.caption)
                    .foregroundStyle(Theme.fgSubtle)
            }
        }
    }

    private func checklistCard(_ dashboard: DashboardDTO) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 0) {
                Text("Hôm nay còn ghi điểm được")
                    .typeStyle(.label)
                    .foregroundStyle(Theme.fgMuted)
                    .padding(.bottom, Theme.Space.x2)
                ForEach(Array(Category.allCases.enumerated()), id: \.element) { index, category in
                    if index > 0 {
                        Divider().overlay(Theme.border)
                    }
                    ChecklistRow(category: category, isDone: dashboard.capsHit[category])
                }
            }
        }
    }

    /// The design system's "accent milestone card": the one card on the screen that carries the
    /// accent soft fill and its border, so the challenge total reads as the milestone number.
    private func totalCard(_ dashboard: DashboardDTO) -> some View {
        SurfaceCard(background: Theme.primarySoft, border: Theme.primaryBorder) {
            HStack {
                VStack(alignment: .leading, spacing: Theme.Space.x1) {
                    Text("Tổng điểm thử thách")
                        .typeStyle(.label)
                        .foregroundStyle(Theme.fgMuted)
                    Text("Thưởng chuỗi: +\(dashboard.streak.bonusPoints)")
                        .typeStyle(.caption)
                        .foregroundStyle(Theme.fgMuted)
                }
                Spacer()
                BigNumber(value: dashboard.total, size: 30)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                dashboard.streak.bonusPoints == 0
                    ? "Tổng điểm: \(dashboard.total)"
                    : "Tổng điểm: \(dashboard.total) (thưởng chuỗi \(dashboard.streak.bonusPoints))"
            )
        }
    }
}

/// One line of the "still scorable today" checklist. A separate view on purpose: `Category` is
/// a plain enum, and SwiftUI skips re-evaluating a `ForEach` row whose element is unchanged even
/// when the parent body re-runs — so the row itself has to depend on the environment locale for
/// `Category.label` and `Rulebook.capNoun` (both `Localized` strings) to follow the picker.
private struct ChecklistRow: View {
    let category: Category
    let isDone: Bool
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: Theme.Space.x3) {
            Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(isDone ? Theme.success : Theme.borderStrong)
            Text(category.label)
                .typeStyle(.bodyMedium)
                .strikethrough(isDone, color: Theme.fgSubtle)
                .foregroundStyle(isDone ? Theme.fgSubtle : Theme.fg)
            Spacer()
            Text(isDone ? "đã đủ \(Rulebook.capNoun(for: category))" : "+\(Rulebook.points(for: category))")
                .typeStyle(.caption)
                .foregroundStyle(isDone ? Theme.fgSubtle : Theme.fg)
        }
        .frame(minHeight: Theme.ControlHeight.md)
    }
}
