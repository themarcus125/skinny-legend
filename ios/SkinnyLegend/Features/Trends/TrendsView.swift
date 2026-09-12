import Charts
import SwiftUI

/// Spec §7: weekly bars (self vs group average), calendar heatmap of active days, category
/// breakdown and a rank-over-time line.
struct TrendsView: View {
    @State private var model: TrendsModel
    @State private var selectedDay: DaySelection?
    private let apiClient: any APIClient

    init(api: any APIClient) {
        self.apiClient = api
        _model = State(initialValue: TrendsModel(api: api))
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
            case .loaded(let trends):
                ScrollView {
                    VStack(spacing: 16) {
                        weeklyBars(trends)
                        heatmap
                        categoryBreakdown(trends)
                        rankLine(trends)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 120)
                }
            }
        }
        .navigationTitle("Xu hướng")
        .task { await model.load() }
        .refreshable { await model.load() }
        .navigationDestination(item: $selectedDay) { selection in
            DayEntriesView(api: apiClient, date: selection.date)
        }
    }

    // MARK: - Weekly bars

    private struct WeeklyBar: Identifiable {
        let id: String
        let week: String
        let series: String
        let points: Double
    }

    /// The chart's series names are data that also render in the legend, so they are resolved
    /// once per read (computed, not stored — a stored `static let` would freeze the language
    /// the app launched in) and shared by the bars and the colour scale.
    private static var mineSeries: String { Localized.string("Bạn") }
    private static var groupSeries: String { Localized.string("Trung bình nhóm") }

    private func weeklyBars(_ trends: TrendsDTO) -> some View {
        let bars = trends.weeks.flatMap { week -> [WeeklyBar] in
            let label = Self.weekLabel(week.week)
            return [
                WeeklyBar(id: "\(week.week)-me", week: label, series: Self.mineSeries, points: Double(week.mine)),
                WeeklyBar(id: "\(week.week)-avg", week: label, series: Self.groupSeries, points: week.groupAvg),
            ]
        }
        return GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Điểm theo tuần")
                    .font(.roundedLabel(13, weight: .bold))
                    .foregroundStyle(.secondary)
                Chart(bars) { bar in
                    BarMark(x: .value("Tuần", bar.week), y: .value("Điểm", bar.points))
                        .foregroundStyle(by: .value("Nhóm", bar.series))
                        .position(by: .value("Nhóm", bar.series))
                        .cornerRadius(6)
                }
                .chartForegroundStyleScale([Self.mineSeries: Theme.flame, Self.groupSeries: Theme.exercise.opacity(0.55)])
                .chartLegend(position: .bottom, spacing: 8)
                .frame(height: 200)
            }
        }
    }

    // MARK: - Calendar heatmap

    private var heatmap: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Ngày hoạt động")
                    .font(.roundedLabel(13, weight: .bold))
                    .foregroundStyle(.secondary)
                Chart(model.heatCells) { cell in
                    RectangleMark(
                        x: .value("Thứ", cell.weekdayLabel),
                        y: .value("Tuần", cell.weekKey)
                    )
                    .foregroundStyle(by: .value("Điểm", cell.points))
                    .cornerRadius(6)
                }
                .chartForegroundStyleScale(range: Gradient(colors: [Theme.flame.opacity(0.10), Theme.ember, Theme.flame]))
                .chartXScale(domain: TrendsModel.weekdayLabels)
                .chartYScale(domain: Array(model.weekKeys.reversed()))
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let week = value.as(String.self) {
                                Text(Self.weekLabel(week)).font(.roundedLabel(11, weight: .medium))
                            }
                        }
                    }
                }
                .chartLegend(.hidden)
                .frame(height: max(120, CGFloat(model.weekKeys.count) * 30))
                .chartOverlay { proxy in
                    GeometryReader { geometry in
                        Rectangle()
                            .fill(.clear)
                            .contentShape(Rectangle())
                            .accessibilityHidden(true)
                            .gesture(
                                SpatialTapGesture().onEnded { tap in
                                    guard let plotFrame = proxy.plotFrame else { return }
                                    let origin = geometry[plotFrame].origin
                                    let local = CGPoint(x: tap.location.x - origin.x, y: tap.location.y - origin.y)
                                    guard let (weekday, week) = proxy.value(at: local, as: (String, String).self),
                                          let cell = model.cell(week: week, weekday: weekday)
                                    else { return }
                                    selectedDay = DaySelection(date: cell.date)
                                }
                            )
                    }
                }
                // The tap gesture above is invisible to VoiceOver, so this is the only route
                // to the per-day drill-down: one synthetic, chronologically-ordered element
                // per cell, each activatable regardless of whether the day scored points.
                .accessibilityChildren {
                    ForEach(model.heatCells) { cell in
                        Color.clear
                            .frame(width: 1, height: 1)
                            .accessibilityLabel(TrendsModel.accessibilityLabel(for: cell))
                            .accessibilityAddTraits(cell.points > 0 ? .isButton : [])
                            .accessibilityAction { selectedDay = DaySelection(date: cell.date) }
                    }
                }
                Text("Chạm vào một ô để xem hoạt động của ngày đó.")
                    .font(.roundedLabel(12, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Category breakdown

    private struct CategorySlice: Identifiable {
        let id: Category
        let points: Int
    }

    private func categoryBreakdown(_ trends: TrendsDTO) -> some View {
        let slices = Category.allCases
            .map { CategorySlice(id: $0, points: trends.byCategory[$0]) }
            .filter { $0.points > 0 }
        return GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Điểm theo hạng mục")
                    .font(.roundedLabel(13, weight: .bold))
                    .foregroundStyle(.secondary)
                if slices.isEmpty {
                    Text("Chưa có điểm nào được ghi nhận.")
                        .font(.roundedLabel(15, weight: .medium))
                        .foregroundStyle(.secondary)
                } else {
                    Chart(slices) { slice in
                        SectorMark(angle: .value("Điểm", slice.points), innerRadius: .ratio(0.618), angularInset: 2)
                            .foregroundStyle(by: .value("Hạng mục", slice.id.shortLabel))
                            .cornerRadius(4)
                    }
                    .chartForegroundStyleScale([
                        Category.exercise.shortLabel: Theme.exercise,
                        Category.meal.shortLabel: Theme.meal,
                        Category.group.shortLabel: Theme.group,
                    ])
                    .chartLegend(position: .bottom, spacing: 8)
                    .frame(height: 200)
                }
                HStack(spacing: 10) {
                    Text("Thưởng chuỗi")
                        .font(.roundedLabel(14, weight: .medium))
                        .foregroundStyle(.secondary)
                    Spacer()
                    PointsBadge(points: trends.streakBonus)
                }
            }
        }
    }

    // MARK: - Rank over time

    private func rankLine(_ trends: TrendsDTO) -> some View {
        let worst = max(trends.weeks.map(\.rank).max() ?? 1, 2)
        return GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Thứ hạng theo tuần")
                    .font(.roundedLabel(13, weight: .bold))
                    .foregroundStyle(.secondary)
                Chart(trends.weeks) { week in
                    LineMark(x: .value("Tuần", Self.weekLabel(week.week)), y: .value("Hạng", Double(week.rank)))
                        .foregroundStyle(Theme.flame)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round))
                    PointMark(x: .value("Tuần", Self.weekLabel(week.week)), y: .value("Hạng", Double(week.rank)))
                        .foregroundStyle(Theme.flame)
                        .symbolSize(80)
                }
                // Rank 1 is best, so the axis runs downwards.
                .chartYScale(domain: [Double(worst) + 0.5, 0.5])
                .chartYAxis {
                    AxisMarks(position: .leading, values: (1...worst).map(Double.init)) { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let rank = value.as(Double.self) {
                                Text("#\(Int(rank))").font(.roundedLabel(11, weight: .medium))
                            }
                        }
                    }
                }
                .frame(height: 180)
            }
        }
    }

    /// `2026-W37` → `T37`.
    private static func weekLabel(_ weekKey: String) -> String {
        "T\(weekKey.suffix(2))"
    }
}
