import SwiftUI

/// Spec §7: today's points, streak counter, delta vs yesterday, rank, and a checklist of what
/// can still score today.
struct DashboardView: View {
    @State private var model: DashboardModel
    private let apiClient: any APIClient

    init(api: any APIClient) {
        self.apiClient = api
        _model = State(initialValue: DashboardModel(api: api))
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
            case .loaded(let dashboard):
                content(dashboard)
            }
        }
        .navigationTitle("Tổng quan")
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
                    GlassCard {
                        HStack {
                            Label("Nhật ký nhóm", systemImage: "photo.stack")
                                .font(.roundedLabel(17, weight: .semibold))
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.secondary)
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
        GlassCard(padding: 22) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Điểm hôm nay")
                    .font(.roundedLabel(13, weight: .bold))
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    BigNumber(value: dashboard.today.points, size: 66)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Điểm hôm nay: \(dashboard.today.points)")
                    deltaBadge(dashboard.deltaVsYesterday)
                }
                if dashboard.today.categories.isEmpty {
                    Text("Chưa ghi nhận hoạt động nào hôm nay.")
                        .font(.roundedLabel(14, weight: .medium))
                        .foregroundStyle(.secondary)
                } else {
                    GlassEffectContainer(spacing: 8) {
                        FlowLayout(spacing: 8, rowSpacing: 8) {
                            ForEach(dashboard.today.categories) { category in
                                CategoryChip(category: category)
                            }
                        }
                    }
                }
            }
        }
    }

    private func deltaBadge(_ delta: Int) -> some View {
        Label(
            deltaCaption(delta),
            systemImage: delta > 0 ? "arrow.up.right" : delta < 0 ? "arrow.down.right" : "equal"
        )
        .font(.roundedLabel(13, weight: .semibold))
        .foregroundStyle(delta > 0 ? Theme.meal : delta < 0 ? Theme.flame : Color.secondary)
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
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Chuỗi ngày")
                    .font(.roundedLabel(13, weight: .bold))
                    .foregroundStyle(.secondary)
                StreakFlame(days: dashboard.streak.current, size: 30)
                Text("Dài nhất: \(dashboard.streak.longest) ngày")
                    .font(.roundedLabel(12, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func rankCard(_ dashboard: DashboardDTO) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Thứ hạng")
                    .font(.roundedLabel(13, weight: .bold))
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    BigNumber(value: dashboard.rank, size: 34, tint: Theme.ember)
                    Text("/ \(dashboard.memberCount)")
                        .font(.roundedLabel(16, weight: .bold))
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Xếp hạng \(dashboard.rank) trên \(dashboard.memberCount)")
                Text("trong nhóm")
                    .font(.roundedLabel(12, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func checklistCard(_ dashboard: DashboardDTO) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Hôm nay còn ghi điểm được")
                    .font(.roundedLabel(13, weight: .bold))
                    .foregroundStyle(.secondary)
                ForEach(Category.allCases) { category in
                    let isDone = dashboard.capsHit[category]
                    HStack(spacing: 10) {
                        Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(isDone ? Theme.meal : Color.secondary)
                        Text(category.label)
                            .font(.roundedLabel(16, weight: .medium))
                            .strikethrough(isDone, color: .secondary)
                            .foregroundStyle(isDone ? Color.secondary : Color.primary)
                        Spacer()
                        Text(isDone ? "đã đủ \(Rulebook.capNoun(for: category))" : "+\(Rulebook.points(for: category))")
                            .font(.roundedLabel(14, weight: .bold))
                            .foregroundStyle(isDone ? Color.secondary : Theme.flame)
                    }
                }
            }
        }
    }

    private func totalCard(_ dashboard: DashboardDTO) -> some View {
        GlassCard {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tổng điểm thử thách")
                        .font(.roundedLabel(13, weight: .bold))
                        .foregroundStyle(.secondary)
                    Text("Thưởng chuỗi: +\(dashboard.streak.bonusPoints)")
                        .font(.roundedLabel(12, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                BigNumber(value: dashboard.total, size: 40)
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
