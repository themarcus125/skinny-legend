import SwiftUI

/// "Đổi" — the five nearest points of interest, plus the option to drop the place entirely.
struct PlacePickerSheet: View {
    let resolver: PlaceResolver
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Địa điểm gần bạn") {
                    ForEach(resolver.candidates) { place in
                        Button {
                            resolver.choose(place)
                            dismiss()
                        } label: {
                            HStack {
                                Label(place.name, systemImage: "mappin.circle.fill")
                                    .font(.roundedLabel(16, weight: .medium))
                                Spacer()
                                if resolver.selected?.name == place.name {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Theme.flame)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    if resolver.candidates.isEmpty {
                        Text("Không tìm thấy địa điểm nào gần đây.")
                            .font(.roundedLabel(15, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                }
                Section {
                    Button("Bỏ địa điểm", role: .destructive) {
                        resolver.clear()
                        dismiss()
                    }
                }
            }
            .navigationTitle("Đổi địa điểm")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Xong") { dismiss() }
                }
            }
        }
        .presentationSizing(.form)
        .presentationDetents([.medium, .large])
    }
}

/// The removable place chip shown on the Track screen and in the verdict sheet (spec §8 step 5).
struct PlaceChip: View {
    let resolver: PlaceResolver
    @State private var isPickerPresented = false

    var body: some View {
        if resolver.isResolving {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Đang tìm địa điểm…")
                    .font(.roundedLabel(14, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .glassEffect(.regular, in: Capsule())
        } else if let place = resolver.selected {
            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    Label(place.name, systemImage: "mappin.circle.fill")
                        .font(.roundedLabel(14, weight: .medium))
                        .lineLimit(1)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .glassEffect(.regular, in: Capsule())

                    Button("Đổi") { isPickerPresented = true }
                        .font(.roundedLabel(14))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .glassEffect(.regular.tint(Theme.flame.opacity(0.45)).interactive(), in: Capsule())
                        .buttonStyle(.plain)

                    Button {
                        resolver.clear()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .padding(11)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: Circle())
                    .accessibilityLabel("Bỏ địa điểm")
                }
            }
            .sheet(isPresented: $isPickerPresented) {
                PlacePickerSheet(resolver: resolver)
            }
        }
    }
}
