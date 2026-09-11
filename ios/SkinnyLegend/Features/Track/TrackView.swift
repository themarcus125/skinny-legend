import PhotosUI
import SwiftUI

struct TrackView: View {
    @State private var model: TrackModel
    @State private var places: PlaceResolver
    @State private var pickerItem: PhotosPickerItem?
    @State private var isCameraPresented = false
    /// The in-flight prepare/upload/resolve pipeline for the current photo, so a photo swap or
    /// discard can cancel a stale one before it can overwrite state for the new photo.
    @State private var loadTask: Task<Void, Never>?

    init(api: any APIClient, placeSearch: any PlaceSearching, locator: any LocationFixing) {
        _model = State(initialValue: TrackModel(api: api))
        _places = State(initialValue: PlaceResolver(search: placeSearch, locator: locator))
    }

    var body: some View {
        ZStack {
            WarmBackground()
            ScrollView {
                VStack(spacing: 20) {
                    header
                    if let preview = model.previewImage {
                        photoCard(preview)
                        PlaceChip(resolver: places)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    statusCard
                    actionButtons
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 120)
            }
        }
        .navigationTitle("Ghi nhận")
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            loadTask?.cancel()
            loadTask = Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await handle(data)
                }
                pickerItem = nil
            }
        }
        .fullScreenCover(isPresented: $isCameraPresented) {
            CameraPicker { data in
                loadTask?.cancel()
                loadTask = Task { await handle(data) }
            }
            .ignoresSafeArea()
        }
    }

    /// Spec §7: "While uploading, the app fetches one location fix" — the upload and the place
    /// lookup run concurrently rather than one after the other.
    private func handle(_ data: Data) async {
        guard await model.prepare(imageData: data) else { return }
        async let uploading: Void = model.upload()
        async let resolving: Void = places.resolve(exifPoint: model.prepared?.coordinate)
        _ = await (uploading, resolving)
    }

    private var header: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Hôm nay bạn đã làm gì?")
                    .font(.roundedLabel(22, weight: .bold))
                Text("Chụp buổi tập, bữa ăn lành mạnh hoặc hoạt động nhóm — mỗi ảnh một lần ghi điểm.")
                    .font(.roundedLabel(14, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func photoCard(_ image: UIImage) -> some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .frame(height: 260)
            .clipShape(RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Button {
                    loadTask?.cancel()
                    loadTask = nil
                    model.reset()
                    places.clear()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .padding(9)
                }
                .buttonStyle(.glass)
                .padding(10)
            }
    }

    @ViewBuilder
    private var statusCard: some View {
        switch model.phase {
        case .idle:
            EmptyView()
        case .preparing:
            GlassCard {
                Label("Đang nén ảnh…", systemImage: "wand.and.sparkles")
                    .font(.roundedLabel(15))
            }
        case .uploading(let fraction):
            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Đang tải ảnh lên… \(Int(fraction * 100))%")
                        .font(.roundedLabel(15))
                    ProgressView(value: fraction)
                        .tint(Theme.flame)
                }
            }
        case .uploaded:
            GlassCard {
                Label("Đã tải ảnh lên", systemImage: "checkmark.circle.fill")
                    .font(.roundedLabel(15))
                    .foregroundStyle(Theme.meal)
            }
        case .failed(let message):
            GlassCard {
                VStack(alignment: .leading, spacing: 12) {
                    Label(message, systemImage: "exclamationmark.triangle.fill")
                        .font(.roundedLabel(15))
                        .foregroundStyle(Theme.flame)
                    if model.prepared != nil {
                        Button("Thử lại") { Task { await model.retryUpload() } }
                            .buttonStyle(.glassProminent)
                    }
                }
            }
        }
    }

    private var actionButtons: some View {
        GlassEffectContainer(spacing: 14) {
            HStack(spacing: 14) {
                Button {
                    isCameraPresented = true
                } label: {
                    Label("Chụp ảnh", systemImage: "camera.fill")
                        .font(.roundedLabel(17))
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                }
                .buttonStyle(.glassProminent)
                .tint(Theme.flame)
                .disabled(!CameraPicker.isAvailable || model.isBusy)

                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                    Label("Thư viện", systemImage: "photo.on.rectangle")
                        .font(.roundedLabel(17))
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                }
                .buttonStyle(.glass)
                .disabled(model.isBusy)
            }
        }
    }
}
