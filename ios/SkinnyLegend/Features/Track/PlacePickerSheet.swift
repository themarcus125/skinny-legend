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
                                    .typeStyle(.bodyMedium)
                                    .foregroundStyle(Theme.fg)
                                Spacer()
                                if resolver.selected?.name == place.name {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Theme.primary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    if resolver.candidates.isEmpty {
                        Text("Không tìm thấy địa điểm nào gần đây.")
                            .typeStyle(.bodyMedium)
                            .foregroundStyle(Theme.fgMuted)
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
            HStack(spacing: Theme.Space.x2) {
                ProgressView().controlSize(.small).tint(Theme.primary)
                Text("Đang tìm địa điểm…")
                    .typeStyle(.caption)
                    .foregroundStyle(Theme.fgMuted)
            }
            .padding(.horizontal, Theme.Space.x3)
            .padding(.vertical, Theme.Space.x2)
            .background(Theme.surface2, in: Capsule())
            .overlay { Capsule().strokeBorder(Theme.border, lineWidth: 1) }
        } else if let place = resolver.selected {
            HStack(spacing: Theme.Space.x2) {
                Label(place.name, systemImage: "mappin.circle.fill")
                    .typeStyle(.caption)
                    .foregroundStyle(Theme.fgMuted)
                    .lineLimit(1)
                    .padding(.horizontal, Theme.Space.x3)
                    .padding(.vertical, Theme.Space.x2)
                    .background(Theme.surface2, in: Capsule())
                    .overlay { Capsule().strokeBorder(Theme.border, lineWidth: 1) }

                Button("Đổi") { isPickerPresented = true }
                    .buttonStyle(.ds(.secondary, size: .sm))

                Button {
                    resolver.clear()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.fgMuted)
                        .frame(width: Theme.ControlHeight.sm, height: Theme.ControlHeight.sm)
                        .background(Theme.surface2, in: Circle())
                        .overlay { Circle().strokeBorder(Theme.border, lineWidth: 1) }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Bỏ địa điểm")
            }
            .sheet(isPresented: $isPickerPresented) {
                PlacePickerSheet(resolver: resolver)
            }
        }
    }
}
