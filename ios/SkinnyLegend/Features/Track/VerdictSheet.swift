import SwiftUI

/// Spec §7: photo, AI reason, detected categories as toggleable chips, projected points,
/// cap warnings, and the location chip. "Không đúng?" expands the chips for editing.
struct VerdictSheet: View {
    @Bindable var model: VerdictSheetModel
    var placeResolver: PlaceResolver?
    let onConfirmed: (EntryDTO) -> Void
    @Environment(\.dismiss) private var dismiss

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
                            .font(.roundedLabel(14, weight: .medium))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .glassEffect(.regular, in: Capsule())
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    pointsCard
                    if let errorMessage = model.errorMessage {
                        Text(errorMessage)
                            .font(.roundedLabel(14, weight: .medium))
                            .foregroundStyle(.red)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 120)
            }
            .background { WarmBackground() }
            .navigationTitle(model.verdict == nil ? "Sửa hoạt động" : "Xác nhận hoạt động")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Huỷ") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task {
                        if let entry = await model.confirm() {
                            onConfirmed(entry)
                            dismiss()
                        }
                    }
                } label: {
                    Text(model.isSaving ? "Đang lưu…" : "Xác nhận")
                        .font(.roundedLabel(18))
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                }
                .buttonStyle(.glassProminent)
                .tint(Theme.flame)
                .disabled(model.isSaving)
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
            }
        }
        .onChange(of: placeResolver?.selected) { _, _ in
            guard let placeResolver else { return }
            model.applyPlace(name: placeResolver.placeName, source: placeResolver.placeSource)
        }
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
            GlassCard {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: verdict.failed ? "questionmark.circle.fill" : "sparkles")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Theme.ember)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(verdict.failed ? "Không nhận diện được ảnh" : "AI nhận định")
                            .font(.roundedLabel(13, weight: .bold))
                            .foregroundStyle(.secondary)
                        Text(verdict.failed ? "Hãy chọn hạng mục phù hợp bên dưới." : verdict.reason)
                            .font(.roundedLabel(16, weight: .medium))
                    }
                }
            }
        }
    }

    private var chipsCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Hạng mục")
                        .font(.roundedLabel(13, weight: .bold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    if model.verdict != nil {
                        Button(model.isEditingCategories ? "Xong" : "Không đúng?") {
                            withAnimation(.smooth(duration: 0.25)) { model.isEditingCategories.toggle() }
                        }
                        .font(.roundedLabel(14))
                        .foregroundStyle(Theme.flame)
                    }
                }

                GlassEffectContainer(spacing: 10) {
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
                }

                ForEach(model.capWarnings, id: \.self) { warning in
                    Label(warning, systemImage: "exclamationmark.triangle.fill")
                        .font(.roundedLabel(13, weight: .medium))
                        .foregroundStyle(Theme.ember)
                }
            }
        }
    }

    /// Collapsed, the sheet shows only what the AI found; expanded, it shows all three.
    private var visibleCategories: [Category] {
        model.isEditingCategories ? Category.allCases : Category.allCases.filter { model.selected.contains($0) }
    }

    private var pointsCard: some View {
        GlassCard {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Điểm dự kiến")
                        .font(.roundedLabel(13, weight: .bold))
                        .foregroundStyle(.secondary)
                    Text("Điểm chính thức do máy chủ tính khi xác nhận.")
                        .font(.roundedLabel(12, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                BigNumber(value: model.projectedPoints, size: 44)
            }
        }
    }
}
