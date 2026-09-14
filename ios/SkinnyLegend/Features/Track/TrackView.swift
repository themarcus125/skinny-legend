import PhotosUI
import SwiftUI

struct TrackView: View {
    /// Declared so this body re-runs when the Account picker changes the language: it renders
    /// `String`s from `Localized` (labels, `LocalDay.display`), and `Text(String)` carries no
    /// locale dependency of its own the way `Text(LocalizedStringKey)` does.
    @Environment(\.locale) private var locale
    @Environment(AppEnvironment.self) private var env
    @State private var model: TrackModel
    @State private var places: PlaceResolver
    @State private var pickerItem: PhotosPickerItem?
    @State private var isCameraPresented = false
    /// The in-flight prepare/upload/resolve pipeline for the current photo, so a photo swap or
    /// discard can cancel a stale one before it can overwrite state for the new photo.
    @State private var loadTask: Task<Void, Never>?
    @State private var verdictModel: VerdictSheetModel?
    /// The sheet model kept past dismissal, since `verdictModel` may already be nil by the time
    /// `onDismiss` runs and the outcome (tracked, corrected, or abandoned) lives on the model.
    @State private var presentedVerdict: VerdictSheetModel?
    /// Celebration for an entry confirmed by hand from a failed verdict; an AI-confirmed entry
    /// celebrates inside the sheet itself, on first appearance.
    @State private var celebrationPoints: Int?
    private let apiClient: any APIClient

    init(api: any APIClient, placeSearch: any PlaceSearching, locator: any LocationFixing) {
        self.apiClient = api
        _model = State(initialValue: TrackModel(api: api))
        _places = State(initialValue: PlaceResolver(search: placeSearch, locator: locator))
    }

    var body: some View {
        ZStack {
            AppBackground()
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
        // A `String` title on purpose: a `LocalizedStringKey` title is bridged to the navigation bar
        // once and never re-resolves when the in-app language changes; this one is recomputed
        // because the view declares `@Environment(\.locale)`.
        .navigationTitle(Localized.string("Ghi nhận"))
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
        .sheet(item: $verdictModel, onDismiss: verdictSheetDismissed) { sheetModel in
            VerdictSheet(model: sheetModel, placeResolver: places)
        }
        .overlay {
            if let celebrationPoints {
                CelebrationOverlay(points: celebrationPoints)
                    .transition(.opacity)
                    .task {
                        try? await Task.sleep(for: .seconds(1.8))
                        withAnimation(.smooth(duration: 0.3)) { self.celebrationPoints = nil }
                    }
            }
        }
    }

    /// Spec §7: "While uploading, the app fetches one location fix" — the upload and the place
    /// lookup run concurrently rather than one after the other. Once uploaded, `POST /entries`
    /// runs the vision model and the verdict sheet opens on its result.
    private func handle(_ data: Data) async {
        guard await model.prepare(imageData: data) else { return }
        async let uploading: Void = model.upload()
        async let resolving: Void = places.resolve(exifPoint: model.prepared?.coordinate)
        _ = await (uploading, resolving)
        guard model.phase == .uploaded else { return }
        await model.createEntry(placeName: places.placeName, placeSource: places.placeSource, point: places.selected?.point ?? places.fix)
        guard model.phase == .ready, let result = model.createResult else { return }
        let sheetModel = VerdictSheetModel(
            api: apiClient,
            entry: result.entry,
            mode: .created(result.verdict),
            capsHit: result.capsHit,
            cappedCategories: result.cappedCategories,
            projectedPoints: result.projectedPoints,
            placeName: places.placeName,
            placeSource: places.placeSource
        )
        presentedVerdict = sheetModel
        verdictModel = sheetModel
    }

    /// Runs on every way out of the verdict sheet — "Xong", "Lưu thay đổi", "Xác nhận", "Huỷ"
    /// or a swipe. The entry counts once it is confirmed, whether `POST /entries` did that from
    /// the AI verdict or the user did it with a `PATCH`; a pending entry abandoned unconfirmed
    /// leaves the photo in place, as before.
    private func verdictSheetDismissed() {
        guard let sheetModel = presentedVerdict else { return }
        presentedVerdict = nil
        switch sheetModel.outcome {
        case .abandoned:
            return
        case .tracked:
            break   // the sheet already celebrated, on its first appearance
        case .confirmedByHand:
            celebrationPoints = sheetModel.projectedPoints
        }
        model.reset()
        places.clear()
        // Spec §E: ask for notification permission after the first confirmed entry, never at
        // launch. Wait out the celebration overlay (1.8 s) and the sheet's dismissal so the
        // system alert does not land on top of either. No-ops on every later entry.
        guard let userID = env.currentUser?.id else { return }
        let push = env.push
        Task {
            try? await Task.sleep(for: .seconds(2))
            await push.requestAfterFirstConfirmedEntry(userID: userID)
        }
    }

    private var header: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Hôm nay bạn đã làm gì?")
                    .typeStyle(.h2)
                    .foregroundStyle(Theme.fg)
                Text("Chụp buổi tập, bữa ăn lành mạnh hoặc hoạt động nhóm — mỗi ảnh một lần ghi điểm.")
                    .typeStyle(.caption)
                    .foregroundStyle(Theme.fgMuted)
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
                        .foregroundStyle(Theme.fg)
                        .padding(10)
                        .background(Theme.surface, in: Circle())
                        .overlay { Circle().strokeBorder(Theme.border, lineWidth: 1) }
                        .elevation(.e1)
                }
                .buttonStyle(.plain)
                .padding(10)
                .accessibilityLabel("Bỏ ảnh")
            }
    }

    @ViewBuilder
    private var statusCard: some View {
        switch model.phase {
        case .idle:
            EmptyView()
        case .preparing:
            SurfaceCard {
                Label("Đang nén ảnh…", systemImage: "wand.and.sparkles")
                    .typeStyle(.bodyMedium)
                    .foregroundStyle(Theme.fgMuted)
            }
        case .uploading(let fraction):
            SurfaceCard {
                VStack(alignment: .leading, spacing: Theme.Space.x3) {
                    Text("Đang tải ảnh lên… \(Int(fraction * 100))%")
                        .typeStyle(.bodyMedium)
                        .foregroundStyle(Theme.fg)
                    ProgressBar(progress: fraction)
                }
            }
        case .uploaded:
            SurfaceCard {
                Label("Đã tải ảnh lên", systemImage: "checkmark.circle.fill")
                    .typeStyle(.bodyMedium)
                    .foregroundStyle(Theme.success)
            }
        case .analyzing:
            SurfaceCard {
                HStack(spacing: Theme.Space.x3) {
                    ProgressView().controlSize(.small).tint(Theme.primary)
                    Text("AI đang xem ảnh…")
                        .typeStyle(.bodyMedium)
                        .foregroundStyle(Theme.fg)
                }
            }
        case .ready:
            SurfaceCard {
                Label("Đã phân tích xong", systemImage: "sparkles")
                    .typeStyle(.bodyMedium)
                    .foregroundStyle(Theme.info)
            }
        case .failed(let message):
            SurfaceCard {
                VStack(alignment: .leading, spacing: Theme.Space.x3) {
                    AlertBanner(kind: .destructive, message: message)
                    if model.prepared != nil {
                        Button("Thử lại") { Task { await model.retryUpload() } }
                            .buttonStyle(.ds(.primary, size: .md))
                    }
                }
            }
        }
    }

    private var actionButtons: some View {
        HStack(spacing: Theme.Space.x3) {
            Button {
                isCameraPresented = true
            } label: {
                Label("Chụp ảnh", systemImage: "camera.fill")
            }
            .buttonStyle(.ds(.primary, size: .lg, fullWidth: true))
            .disabled(!CameraPicker.isAvailable || model.isBusy)

            PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                Label("Thư viện", systemImage: "photo.on.rectangle")
            }
            .buttonStyle(.ds(.secondary, size: .lg, fullWidth: true))
            .disabled(model.isBusy)
        }
    }
}
