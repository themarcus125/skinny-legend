import Testing
import Foundation
@testable import SkinnyLegend

@Suite("ProfileEditModel")
@MainActor
struct ProfileEditModelTests {
    private func user(displayName: String = "Khoa") -> UserDTO {
        UserDTO(
            id: "u1", firebaseUid: "fb1", displayName: displayName, avatarKey: nil,
            role: .member, status: .active, createdAt: Date()
        )
    }

    @Test("canSave rejects empty, whitespace-only and over-long names")
    func canSaveRejectsInvalidNames() {
        let model = ProfileEditModel(api: MockAPIClient(), user: user())

        model.displayName = ""
        #expect(model.canSave == false)

        model.displayName = "   "
        #expect(model.canSave == false)

        model.displayName = String(repeating: "a", count: 41)
        #expect(model.canSave == false)
    }

    @Test("canSave accepts a changed name within the 40-char limit")
    func canSaveAcceptsValidName() {
        let model = ProfileEditModel(api: MockAPIClient(), user: user())

        model.displayName = String(repeating: "a", count: 40)
        #expect(model.canSave)

        model.displayName = "Khoa Nguyen"
        #expect(model.canSave)
    }

    @Test("canSave is false when nothing has changed")
    func canSaveFalseWhenUnchanged() {
        let model = ProfileEditModel(api: MockAPIClient(), user: user(displayName: "Khoa"))
        #expect(model.canSave == false)
    }

    @Test("save() with a changed name only sends displayName")
    func savesNameOnly() async throws {
        let client = RecordingAPIClient(resultUser: user(displayName: "Khoa Mới"))
        let model = ProfileEditModel(api: client, user: user())
        model.displayName = "Khoa Mới"

        let saved = try #require(await model.save())
        #expect(saved.displayName == "Khoa Mới")

        let calls = await client.updateMeCalls
        #expect(calls.count == 1)
        #expect(calls.first?.displayName == "Khoa Mới")
        #expect(calls.first?.avatarKey == nil)

        let presignKinds = await client.presignKinds
        #expect(presignKinds.isEmpty)
    }

    @Test("save() with a picked image presigns the avatar kind, uploads, and sends the avatar key")
    func savesPickedAvatar() async throws {
        let client = RecordingAPIClient(resultUser: user())
        let model = ProfileEditModel(api: client, user: user())
        model.usePickedImage(data: JPEGFactory.make(width: 800, height: 600))
        #expect(model.canSave)

        _ = await model.save()

        let presignKinds = await client.presignKinds
        #expect(presignKinds == [.avatar])

        let uploadedContentType = await client.uploadedContentType
        #expect(uploadedContentType == "image/jpeg")

        let calls = await client.updateMeCalls
        #expect(calls.count == 1)
        #expect(calls.first?.avatarKey == "avatars/u1.jpg")
        #expect(calls.first?.displayName == nil)
    }

    @Test("A server failure maps to APIError.userMessage")
    func mapsAPIErrorToUserMessage() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let client = RecordingAPIClient(resultUser: user(), updateMeError: error)
        let model = ProfileEditModel(api: client, user: user())
        model.displayName = "Khoa Mới"

        let result = await model.save()
        #expect(result == nil)
        #expect(model.errorMessage == error.userMessage)
    }

    @Test("A non-API error falls back to the Vietnamese generic message")
    func mapsGenericErrorToFallbackMessage() async {
        struct GenericError: Error {}
        let client = RecordingAPIClient(resultUser: user(), updateMeError: GenericError())
        let model = ProfileEditModel(api: client, user: user())
        model.displayName = "Khoa Mới"

        let result = await model.save()
        #expect(result == nil)
        #expect(model.errorMessage == "Không lưu được, hãy thử lại.")
    }
}

/// Records `updateMe`/`presign`/`upload` calls so `ProfileEditModel.save()` can be asserted
/// precisely (which fields it sends, which upload kind it presigns) without inspecting a full
/// mock backend. Same recording-stub shape as the other model test suites.
actor RecordingAPIClient: APIClient {
    private(set) var updateMeCalls: [(displayName: String?, avatarKey: String?)] = []
    private(set) var presignKinds: [UploadKind] = []
    private(set) var uploadedContentType: String?

    private let resultUser: UserDTO
    private let updateMeError: Error?

    init(resultUser: UserDTO, updateMeError: Error? = nil) {
        self.resultUser = resultUser
        self.updateMeError = updateMeError
    }

    func session() async throws -> UserDTO { fatalError("unused in this test") }
    func me() async throws -> UserDTO { fatalError("unused in this test") }

    func updateMe(displayName: String?, avatarKey: String?) async throws -> UserDTO {
        updateMeCalls.append((displayName, avatarKey))
        if let updateMeError { throw updateMeError }
        return resultUser
    }

    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO {
        presignKinds.append(kind)
        return PresignDTO(key: "avatars/u1.jpg", url: "https://example.com/put", expiresAt: Date())
    }

    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws {
        uploadedContentType = contentType
    }

    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse { fatalError("unused in this test") }
    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse { fatalError("unused in this test") }
    func deleteEntry(id: String) async throws { fatalError("unused in this test") }
    func myEntries(cursor: String?) async throws -> HistoryPage { fatalError("unused in this test") }
    func dashboard() async throws -> DashboardDTO { fatalError("unused in this test") }
    func leaderboard() async throws -> [LeaderboardRow] { fatalError("unused in this test") }
    func trends() async throws -> TrendsDTO { fatalError("unused in this test") }
    func feed(cursor: String?) async throws -> FeedPage { fatalError("unused in this test") }
    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage { fatalError("unused in this test") }
    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws { fatalError("unused in this test") }
    func mapPins(days: Int) async throws -> MapPinsPage { fatalError("unused in this test") }
}
