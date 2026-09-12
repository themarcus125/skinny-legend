import SwiftUI
import UIKit

/// Spec §7 Account: history grouped by day with edit via the same verdict sheet. The profile
/// and settings sections are added by the next two tasks into this same list.
struct AccountView: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    @State private var model: AccountModel
    @State private var editing: VerdictSheetModel?
    @State private var isProfileSheetPresented = false
    @State private var isFeedbackSheetPresented = false
    @State private var isSignOutConfirming = false
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    private let apiClient: any APIClient

    init(api: any APIClient) {
        self.apiClient = api
        _model = State(initialValue: AccountModel(api: api))
    }

    var body: some View {
        let name = env.currentUser?.displayName ?? ""
        List {
            Section {
                Button {
                    isProfileSheetPresented = true
                } label: {
                    HStack(spacing: 14) {
                        AvatarView(url: model.profileSummary?.avatarUrl,
                                   displayName: name,
                                   size: 56)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(name)
                                .font(.roundedLabel(19, weight: .bold))
                            if let rank = model.myRank, let total = model.myTotal {
                                Text("Hạng \(rank) · \(total) điểm")
                                    .font(.roundedLabel(13, weight: .medium))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Hồ sơ của \(name)")
                .accessibilityHint("Nhấn để chỉnh sửa hồ sơ")
            }

            Section {
                // Spec §E: the reminders toggle registers/unregisters this device. Permission is
                // only ever requested from here or after the first confirmed entry.
                Toggle(isOn: Binding(
                    get: { env.push.isEnabled },
                    set: { isOn in
                        Task {
                            if isOn { await env.push.enable() } else { await env.push.disable() }
                        }
                    }
                )) {
                    Label("Nhắc nhở", systemImage: "bell.badge")
                        .font(.roundedLabel(16, weight: .medium))
                }
                .disabled(env.push.isBusy || env.push.permission == .denied)
                .accessibilityHint("Nhắc bạn ghi nhận hoạt động mỗi tối")

                // Permission revoked in Settings: the toggle cannot turn it back on, so say why
                // and open the one place that can, instead of bouncing the switch back off.
                if env.push.permission == .denied {
                    Button {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Mở Cài đặt", systemImage: "gearshape")
                                .font(.roundedLabel(16, weight: .medium))
                            Text("Thông báo đang tắt trong Cài đặt. Bật lại ở đó để nhận nhắc nhở.")
                                .font(.roundedLabel(13, weight: .medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Mở Cài đặt để bật lại thông báo")
                }

                if let pushError = env.push.errorMessage {
                    Label(pushError, systemImage: "exclamationmark.triangle.fill")
                        .font(.roundedLabel(13, weight: .medium))
                        .foregroundStyle(Theme.flame)
                }

                Picker(selection: Binding(
                    get: { env.appLocale },
                    set: { choice in Task { await env.setAppLocale(choice) } }
                )) {
                    Text("Hệ thống").tag(AppLocale.system)
                    Text("Tiếng Việt").tag(AppLocale.vi)
                    Text("English").tag(AppLocale.en)
                } label: {
                    Label("Ngôn ngữ", systemImage: "globe")
                        .font(.roundedLabel(16, weight: .medium))
                }
                .pickerStyle(.menu)
                .accessibilityHint("Đổi ngôn ngữ hiển thị của ứng dụng")

                Link(destination: AppMode.momoFundURL) {
                    Label("Quỹ nhóm", systemImage: "banknote")
                        .font(.roundedLabel(16, weight: .medium))
                }
                .accessibilityElement(children: .combine)
                .accessibilityHint("Mở trang quỹ Momo")

                Button {
                    isFeedbackSheetPresented = true
                } label: {
                    Label("Gửi góp ý", systemImage: "bubble.left.and.text.bubble.right")
                        .font(.roundedLabel(16, weight: .medium))
                }
                .buttonStyle(.plain)

                Button(role: .destructive) {
                    isSignOutConfirming = true
                } label: {
                    Label("Đăng xuất", systemImage: "rectangle.portrait.and.arrow.right")
                        .font(.roundedLabel(16, weight: .medium))
                }
                .buttonStyle(.plain)

                HStack {
                    Label("Phiên bản", systemImage: "info.circle")
                        .font(.roundedLabel(16, weight: .medium))
                    Spacer()
                    Text(AppMode.appVersion)
                        .font(.roundedLabel(15, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }

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
                        let delete: () -> Void = { Task { await model.delete(entry) } }
                        Button {
                            editing = makeEditModel(for: entry)
                        } label: {
                            HistoryRow(entry: entry, onDelete: delete)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            Button("Xoá", role: .destructive, action: delete)
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
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(LocalDay.display(section.date)): \(section.points) điểm")
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
        // A `String` title on purpose: a `LocalizedStringKey` title is bridged to the navigation bar
        // once and never re-resolves when the in-app language changes; this one is recomputed
        // because the view declares `@Environment(\.locale)`.
        .navigationTitle(Localized.string("Tài khoản"))
        .task {
            await env.push.refresh()
            if model.entries.isEmpty { await model.loadFirstPage() }
        }
        .refreshable {
            await env.push.refresh()
            await model.loadFirstPage()
        }
        // Coming back from Settings (the "Mở Cài đặt" row) re-reads the system permission.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await env.push.refresh() } }
        }
        .sheet(item: $editing) { sheetModel in
            VerdictSheet(model: sheetModel, placeResolver: nil) { _ in
                Task { await model.reloadAfterEdit() }
            }
        }
        .sheet(isPresented: $isProfileSheetPresented) {
            if let user = env.currentUser {
                ProfileEditSheet(
                    api: apiClient,
                    user: user,
                    currentAvatarURL: model.profileSummary?.avatarUrl
                ) { _ in
                    Task {
                        await env.refreshMe()
                        await model.loadFirstPage()
                    }
                }
            }
        }
        .sheet(isPresented: $isFeedbackSheetPresented) {
            FeedbackSheet(api: apiClient)
        }
        .confirmationDialog("Đăng xuất khỏi Skinny Legend?", isPresented: $isSignOutConfirming, titleVisibility: .visible) {
            Button("Đăng xuất", role: .destructive) { Task { await env.signOut() } }
            Button("Huỷ", role: .cancel) {}
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
            // Placeholders: VerdictSheetModel ignores capsHit/cappedCategories in `.edit` mode
            // until a successful `confirm()` replaces them with the PATCH response's real ones.
            capsHit: CapsHit.none,
            cappedCategories: [],
            projectedPoints: entry.points,
            placeName: entry.placeName,
            placeSource: entry.placeSource
        )
    }
}

private struct HistoryRow: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    let entry: HistoryEntryDTO
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            RemoteImage(url: entry.thumbUrl ?? entry.photoUrl)
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 6) {
                GlassEffectContainer(spacing: 6) {
                    FlowLayout(spacing: 6, rowSpacing: 6) {
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
        // ios-accessibility: group this row into one VoiceOver/Switch Control stop, and expose
        // the swipe-to-delete gesture (which Switch Control users cannot perform) as a named
        // custom action mirroring the swipeActions button above.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(AccountModel.accessibilityLabel(for: entry))
        .accessibilityHint("Nhấn đúp để sửa")
        .accessibilityAction(named: "Xoá", onDelete)
    }
}
