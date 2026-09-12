import Observation
import PhotosUI
import SwiftUI

/// `POST /feedback` with an optional screenshot uploaded through a presigned PUT (spec §6).
@MainActor
@Observable
final class FeedbackModel {
    private static let maxMessageLength = 2000

    private let api: any APIClient

    var message: String = ""
    private(set) var screenshot: UIImage?
    private var screenshotJPEG: Data?
    private(set) var isSending = false
    private(set) var errorMessage: String?
    private(set) var didSend = false

    init(api: any APIClient) {
        self.api = api
    }

    var canSend: Bool {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isSending && !trimmed.isEmpty && trimmed.count <= Self.maxMessageLength
    }

    func useScreenshot(data: Data) {
        do {
            let prepared = try ImagePipeline.prepare(data)
            screenshotJPEG = prepared.jpeg
            screenshot = UIImage(data: prepared.jpeg)
            errorMessage = nil
        } catch {
            screenshotJPEG = nil
            screenshot = nil
            errorMessage = Localized.string("Ảnh không hợp lệ, hãy chọn ảnh khác.")
        }
    }

    func removeScreenshot() {
        screenshotJPEG = nil
        screenshot = nil
    }

    func send() async {
        guard canSend else { return }
        isSending = true
        errorMessage = nil
        defer { isSending = false }
        do {
            var screenshotKey: String?
            if let jpeg = screenshotJPEG {
                let presign = try await api.presign(kind: .feedback, contentType: "image/jpeg")
                try await api.upload(jpeg, to: presign, contentType: "image/jpeg", onProgress: { _ in })
                screenshotKey = presign.key
            }
            try await api.sendFeedback(
                message: message.trimmingCharacters(in: .whitespacesAndNewlines),
                screenshotKey: screenshotKey,
                appVersion: AppMode.appVersion
            )
            didSend = true
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = Localized.string("Không gửi được góp ý, hãy thử lại.")
        }
    }
}

struct FeedbackSheet: View {
    @State private var model: FeedbackModel
    @State private var pickerItem: PhotosPickerItem?
    @Environment(\.dismiss) private var dismiss

    init(api: any APIClient) {
        _model = State(initialValue: FeedbackModel(api: api))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Góp ý của bạn") {
                    TextEditor(text: $model.message)
                        .font(.roundedLabel(16, weight: .medium))
                        .frame(minHeight: 140)
                }

                Section("Ảnh chụp màn hình (không bắt buộc)") {
                    if let screenshot = model.screenshot {
                        HStack {
                            Image(uiImage: screenshot)
                                .resizable()
                                .scaledToFit()
                                .frame(height: 120)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            Spacer()
                            Button("Bỏ ảnh", role: .destructive) { model.removeScreenshot() }
                                .font(.roundedLabel(14))
                        }
                    } else {
                        PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                            Label("Chọn ảnh", systemImage: "photo.on.rectangle")
                                .font(.roundedLabel(16))
                        }
                    }
                }

                if let errorMessage = model.errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.roundedLabel(14, weight: .medium))
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Text("Phiên bản \(AppMode.appVersion) sẽ được gửi kèm.")
                        .font(.roundedLabel(12, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Gửi góp ý")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Huỷ") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.isSending ? "Đang gửi…" : "Gửi") {
                        Task {
                            await model.send()
                            if model.didSend { dismiss() }
                        }
                    }
                    .disabled(!model.canSend)
                }
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        model.useScreenshot(data: data)
                    }
                    pickerItem = nil
                }
            }
        }
        .presentationSizing(.form)
    }
}
