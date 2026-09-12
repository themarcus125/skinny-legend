import Observation
import PhotosUI
import SwiftUI

@MainActor
@Observable
final class ProfileEditModel {
    private let api: any APIClient
    private let original: UserDTO

    var displayName: String
    private(set) var pickedAvatar: UIImage?
    private var pickedAvatarJPEG: Data?
    private(set) var isSaving = false
    private(set) var errorMessage: String?

    init(api: any APIClient, user: UserDTO) {
        self.api = api
        self.original = user
        self.displayName = user.displayName
    }

    var canSave: Bool {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 40 else { return false }
        return !isSaving && (trimmed != original.displayName || pickedAvatarJPEG != nil)
    }

    func usePickedImage(data: Data) {
        do {
            let jpeg = try ImagePipeline.prepareAvatar(data)
            pickedAvatarJPEG = jpeg
            pickedAvatar = UIImage(data: jpeg)
            errorMessage = nil
        } catch {
            pickedAvatarJPEG = nil
            pickedAvatar = nil
            errorMessage = "Ảnh không hợp lệ, hãy chọn ảnh khác."
        }
    }

    /// Uploads the avatar through a presigned PUT first, then PATCHes `/me` once with both fields.
    func save() async -> UserDTO? {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            var avatarKey: String?
            if let jpeg = pickedAvatarJPEG {
                let presign = try await api.presign(kind: .avatar, contentType: "image/jpeg")
                try await api.upload(jpeg, to: presign, contentType: "image/jpeg", onProgress: { _ in })
                avatarKey = presign.key
            }
            let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            return try await api.updateMe(
                displayName: trimmed == original.displayName ? nil : trimmed,
                avatarKey: avatarKey
            )
        } catch let error as APIError {
            errorMessage = error.userMessage
            return nil
        } catch {
            errorMessage = "Không lưu được, hãy thử lại."
            return nil
        }
    }
}

struct ProfileEditSheet: View {
    @State private var model: ProfileEditModel
    @State private var pickerItem: PhotosPickerItem?
    @Environment(\.dismiss) private var dismiss
    private let currentAvatarURL: String?
    private let onSaved: (UserDTO) -> Void

    init(api: any APIClient, user: UserDTO, currentAvatarURL: String?, onSaved: @escaping (UserDTO) -> Void) {
        self.currentAvatarURL = currentAvatarURL
        self.onSaved = onSaved
        _model = State(initialValue: ProfileEditModel(api: api, user: user))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        VStack(spacing: 12) {
                            if let image = model.pickedAvatar {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 96, height: 96)
                                    .clipShape(Circle())
                            } else {
                                AvatarView(url: currentAvatarURL, displayName: model.displayName, size: 96)
                            }
                            PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                                Text("Đổi ảnh đại diện")
                                    .font(.roundedLabel(15))
                            }
                            .buttonStyle(.glass)
                        }
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                }

                Section("Tên hiển thị") {
                    TextField("Tên hiển thị", text: $model.displayName)
                        .font(.roundedLabel(17, weight: .medium))
                        .textInputAutocapitalization(.words)
                }

                if let errorMessage = model.errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.roundedLabel(14, weight: .medium))
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Hồ sơ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Huỷ") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.isSaving ? "Đang lưu…" : "Lưu") {
                        Task {
                            if let user = await model.save() {
                                onSaved(user)
                                dismiss()
                            }
                        }
                    }
                    .disabled(!model.canSave)
                }
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        model.usePickedImage(data: data)
                    }
                    pickerItem = nil
                }
            }
        }
        .presentationSizing(.form)
    }
}
