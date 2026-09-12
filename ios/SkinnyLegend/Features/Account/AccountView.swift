import SwiftUI

/// Spec §7 Account: history grouped by day with edit via the same verdict sheet. The profile
/// and settings sections are added by the next two tasks into this same list.
struct AccountView: View {
    @State private var model: AccountModel
    @State private var editing: VerdictSheetModel?
    private let apiClient: any APIClient

    init(api: any APIClient) {
        self.apiClient = api
        _model = State(initialValue: AccountModel(api: api))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.roundedLabel(14, weight: .medium))
                        .foregroundStyle(Theme.flame)
                }
            }

            if model.entries.isEmpty && !model.isLoading {
                Section {
                    ContentUnavailableView("Chưa có hoạt động", systemImage: "camera",
                                           description: Text("Ghi nhận hoạt động đầu tiên ở tab Ghi nhận."))
                }
            }

            ForEach(model.sections) { section in
                Section {
                    ForEach(section.entries) { entry in
                        Button {
                            editing = makeEditModel(for: entry)
                        } label: {
                            HistoryRow(entry: entry)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            Button("Xoá", role: .destructive) {
                                Task { await model.delete(entry) }
                            }
                        }
                        .task { await model.loadNextPageIfNeeded(after: entry) }
                    }
                } header: {
                    HStack {
                        Text(LocalDay.display(section.date))
                            .font(.roundedLabel(13, weight: .bold))
                        Spacer()
                        Text("+\(section.points)")
                            .font(.numerals(14))
                            .foregroundStyle(Theme.flame)
                    }
                }
            }

            if model.hasMore {
                Section {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background { WarmBackground() }
        .navigationTitle("Tài khoản")
        .task { if model.entries.isEmpty { await model.loadFirstPage() } }
        .refreshable { await model.loadFirstPage() }
        .sheet(item: $editing) { sheetModel in
            VerdictSheet(model: sheetModel, placeResolver: nil) { _ in
                Task { await model.reloadAfterEdit() }
            }
        }
    }

    /// History edits reuse the verdict sheet in `.edit` mode. There is no fresh server projection
    /// for a past day until the edit is saved, so `capsHit`/`cappedCategories` here are only
    /// placeholders — `VerdictSheetModel` ignores them before `confirm()` and adopts the PATCH
    /// response's real numbers afterwards (ruling 2). `projectedPoints` is seeded with the row's
    /// own already-known points so the card reads correctly until the user actually edits chips.
    private func makeEditModel(for entry: HistoryEntryDTO) -> VerdictSheetModel {
        VerdictSheetModel(
            api: apiClient,
            entry: entry.entry,
            mode: .edit,
            capsHit: CapsHit.none,
            cappedCategories: [],
            projectedPoints: entry.points,
            placeName: entry.placeName,
            placeSource: entry.placeSource
        )
    }
}

private struct HistoryRow: View {
    let entry: HistoryEntryDTO

    var body: some View {
        HStack(spacing: 14) {
            RemoteImage(url: entry.thumbUrl ?? entry.photoUrl)
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 6) {
                GlassEffectContainer(spacing: 6) {
                    HStack(spacing: 6) {
                        ForEach(entry.categories) { category in
                            CategoryChip(category: category)
                        }
                        if entry.categories.isEmpty {
                            Text("Chưa chọn hạng mục")
                                .font(.roundedLabel(13, weight: .medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                HStack(spacing: 6) {
                    if entry.status == .pending {
                        Text("Chưa xác nhận")
                            .font(.roundedLabel(12, weight: .bold))
                            .foregroundStyle(Theme.ember)
                    }
                    if let placeName = entry.placeName {
                        Label(placeName, systemImage: "mappin.circle.fill")
                            .font(.roundedLabel(12, weight: .medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()
            PointsBadge(points: entry.points, isCapped: entry.capped)
        }
        .padding(.vertical, 4)
    }
}
