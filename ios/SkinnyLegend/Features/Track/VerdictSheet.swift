import SwiftUI

/// Spec §7: photo, AI reason, detected categories as toggleable chips, projected points,
/// cap warnings, and the location chip. "Không đúng?" expands the chips for editing.
///
/// On a successful verdict the entry is already tracked when the sheet appears: the title reads
/// "Đã ghi nhận", the celebration plays on first appearance, and the primary button is a plain
/// "Xong" that only dismisses. It turns into "Lưu thay đổi" (a `PATCH`) once the user corrects
/// the categories or the place. A failed verdict (pending entry) and a history edit keep the
/// "Xác nhận" → `PATCH` flow.
struct VerdictSheet: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    @Bindable var model: VerdictSheetModel
    var placeResolver: PlaceResolver?
    /// Called after a successful `PATCH`, before the sheet dismisses. A plain "Xong" dismissal
    /// of an already-tracked entry does not call it — the presenter observes the dismissal.
    var onConfirmed: (EntryDTO) -> Void = { _ in }
    @Environment(\.dismiss) private var dismiss
    @State private var isCelebrating = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    photo
                    reasonCard
                    chipsCard
                    if let placeResolver {
                        PlaceChip(resolver: placeResolver)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else if let name = model.placeName {
                        Label(name, systemImage: "mappin.circle.fill")
                            .typeStyle(.caption)
                            .foregroundStyle(Theme.fgMuted)
                            .padding(.horizontal, Theme.Space.x3)
                            .padding(.vertical, Theme.Space.x2)
                            .background(Theme.surface2, in: Capsule())
                            .overlay { Capsule().strokeBorder(Theme.border, lineWidth: 1) }
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if model.mode != .edit || model.hasConfirmedProjection {
                        pointsCard
                    } else {
                        pendingProjectionNote
                    }
                    if let errorMessage = model.errorMessage {
                        AlertBanner(kind: .destructive, message: errorMessage)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 120)
            }
            .background { AppBackground() }
            .scrollContentBackground(.hidden)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Huỷ") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    guard model.needsSave else {
                        dismiss()
                        return
                    }
                    Task {
                        if let entry = await model.confirm() {
                            onConfirmed(entry)
                            dismiss()
                        }
                    }
                } label: {
                    Text(primaryLabel)
                }
                .buttonStyle(.ds(.primary, size: .lg, fullWidth: true))
                .disabled(!model.canSave)
                .padding(.horizontal, Theme.Space.x4 + 4)
                .padding(.bottom, Theme.Space.x3)
            }
        }
        .onChange(of: placeResolver?.selected) { _, _ in
            guard let placeResolver else { return }
            model.applyPlace(name: placeResolver.placeName, source: placeResolver.placeSource)
        }
        // Spec §14: the celebration plays when the entry is counted — for an AI-confirmed entry
        // that is the moment the sheet first appears, not a later button press.
        .onAppear {
            guard model.isAlreadyTracked, model.markCelebrated() else { return }
            isCelebrating = true
        }
        .overlay {
            if isCelebrating {
                CelebrationOverlay(points: model.projectedPoints)
                    .transition(.opacity)
                    .task {
                        try? await Task.sleep(for: .seconds(1.8))
                        withAnimation(.smooth(duration: 0.3)) { isCelebrating = false }
                    }
            }
        }
    }

    private var title: LocalizedStringKey {
        if model.verdict == nil { return "Sửa hoạt động" }
        return model.isAlreadyTracked ? "Đã ghi nhận" : "Chọn hoạt động"
    }

    private var primaryLabel: LocalizedStringKey {
        if model.isSaving { return "Đang lưu…" }
        if !model.needsSave { return "Xong" }
        return model.isAlreadyTracked ? "Lưu thay đổi" : "Xác nhận"
    }

    private var photo: some View {
        RemoteImage(url: model.entry.photoUrl)
            .frame(height: 220)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
    }

    @ViewBuilder
    private var reasonCard: some View {
        if let verdict = model.verdict {
            SurfaceCard {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: verdict.failed ? "questionmark.circle.fill" : "sparkles")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(verdict.failed ? Theme.warning : Theme.info)
                    VStack(alignment: .leading, spacing: Theme.Space.x1) {
                        Text(verdict.failed ? "Không nhận diện được ảnh" : "AI nhận định")
                            .typeStyle(.label)
                            .foregroundStyle(Theme.fgSubtle)
                        Text(verdict.failed ? Localized.string("Hãy chọn hạng mục phù hợp bên dưới.") : verdict.reason)
                            .typeStyle(.bodyMedium)
                            .foregroundStyle(Theme.fg)
                    }
                }
            }
        }
    }

    private var chipsCard: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Hạng mục")
                        .typeStyle(.label)
                        .foregroundStyle(Theme.fgSubtle)
                    Spacer()
                    if model.verdict != nil {
                        // "Thu gọn" rather than "Xong" so it cannot be mistaken for the primary
                        // "Xong" that dismisses an already-tracked sheet.
                        Button(model.isEditingCategories ? "Thu gọn" : "Không đúng?") {
                            withAnimation(.smooth(duration: 0.25)) { model.isEditingCategories.toggle() }
                        }
                        .buttonStyle(.ds(.ghost, size: .sm))
                    }
                }

                HStack(spacing: 10) {
                    ForEach(visibleCategories) { category in
                        CategoryChip(
                            category: category,
                            isOn: model.selected.contains(category),
                            isCapped: model.isCapped(category),
                            action: model.isEditingCategories ? { model.toggle(category) } : nil
                        )
                    }
                }

                ForEach(model.capWarnings, id: \.self) { warning in
                    AlertBanner(kind: .warning, message: warning)
                }
            }
        }
    }

    /// Collapsed, the sheet shows only what the AI found; expanded, it shows all three.
    private var visibleCategories: [Category] {
        model.isEditingCategories ? Category.allCases : Category.allCases.filter { model.selected.contains($0) }
    }

    /// Ruling 2: an `.edit`-mode sheet has no real projection until the first successful
    /// `confirm()`, so the points card (which would otherwise show an uncapped local estimate)
    /// is replaced by this note until the server's PATCH response lands.
    private var pendingProjectionNote: some View {
        SurfaceCard {
            Text("Điểm sẽ được máy chủ tính lại khi lưu.")
                .typeStyle(.caption)
                .foregroundStyle(Theme.fgMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// An already-tracked entry with no pending correction shows its points as earned; every
    /// other state shows a projection the server will settle on save.
    private var pointsCard: some View {
        SurfaceCard {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: Theme.Space.x1) {
                    if model.isAlreadyTracked && !model.hasChanges {
                        Text("Điểm đã cộng")
                            .typeStyle(.label)
                            .foregroundStyle(Theme.fgSubtle)
                        Text("Đã tính vào tổng điểm của bạn.")
                            .typeStyle(.caption)
                            .foregroundStyle(Theme.fgMuted)
                    } else {
                        Text("Điểm dự kiến")
                            .typeStyle(.label)
                            .foregroundStyle(Theme.fgSubtle)
                        Text("Điểm chính thức do máy chủ tính khi xác nhận.")
                            .typeStyle(.caption)
                            .foregroundStyle(Theme.fgMuted)
                    }
                }
                Spacer()
                BigNumber(value: model.projectedPoints, size: 36)
            }
        }
    }
}
