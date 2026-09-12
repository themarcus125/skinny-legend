import Foundation

/// Every API failure, normalised from the `{ error: { code, message } }` envelope (spec §10).
struct APIError: Error, Equatable, Sendable {
    let status: Int
    let code: String
    /// Localized copy for locally-generated failures; the server's English text otherwise.
    let message: String

    init(status: Int, code: String, message: String) {
        self.status = status
        self.code = code
        self.message = message
    }

    init(status: Int, data: Data) {
        if let envelope = try? JSONDecoder().decode(Envelope.self, from: data) {
            self.init(status: status, code: envelope.error.code, message: envelope.error.message)
        } else {
            self.init(status: status, code: "http_\(status)", message: HTTPURLResponse.localizedString(forStatusCode: status))
        }
    }

    private struct Envelope: Decodable {
        struct Payload: Decodable {
            let code: String
            let message: String
        }
        let error: Payload
    }

    var isPendingApproval: Bool { status == 403 && code == "pending_approval" }
    var isDisabled: Bool { status == 403 && code == "disabled" }
    var isUnauthenticated: Bool { status == 401 }

    /// What the UI shows. Server messages are a fallback only; the known codes get localized
    /// copy, resolved through `Localized` so the in-app language picker applies to them too.
    var userMessage: String {
        switch code {
        case "pending_approval": Localized.string("Tài khoản đang chờ duyệt.")
        case "disabled": Localized.string("Tài khoản đã bị vô hiệu hoá.")
        case "unauthenticated": Localized.string("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.")
        case "network": Localized.string("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.")
        case "photo_missing", "photo_invalid": Localized.string("Ảnh không hợp lệ, hãy chọn ảnh khác.")
        case "taken_at_future": Localized.string("Thời gian chụp ảnh không hợp lệ.")
        case "not_found": Localized.string("Không tìm thấy dữ liệu.")
        default: message.isEmpty ? Localized.string("Đã có lỗi xảy ra.") : message
        }
    }

    /// Protocol-level text no user sees — `userMessage` intercepts the `unauthenticated` code.
    static let unauthenticated = APIError(status: 401, code: "unauthenticated", message: "Missing or invalid token")

    // The locally-generated failures are computed, not stored: a `static let` would resolve its
    // message once, in whatever language was current at first use, and never follow the picker.
    static var malformedURL: APIError {
        APIError(status: 0, code: "bad_url", message: Localized.string("Địa chỉ máy chủ không hợp lệ."))
    }

    static var malformedResponse: APIError {
        APIError(status: 0, code: "bad_response", message: Localized.string("Máy chủ trả về phản hồi không hợp lệ."))
    }

    static func network(_ error: URLError) -> APIError {
        APIError(status: 0, code: "network", message: error.localizedDescription)
    }

    static func decoding(_ error: any Error) -> APIError {
        APIError(status: 0, code: "decoding", message: Localized.string("Dữ liệu trả về không hợp lệ."))
    }
}
