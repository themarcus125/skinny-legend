import Foundation

/// Every API failure, normalised from the `{ error: { code, message } }` envelope (spec §10).
struct APIError: Error, Equatable, Sendable {
    let status: Int
    let code: String
    /// Vietnamese for locally-generated failures; the server's English text otherwise.
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

    /// What the UI shows. Server messages are English, so the known codes get Vietnamese copy.
    var userMessage: String {
        switch code {
        case "pending_approval": "Tài khoản đang chờ duyệt."
        case "disabled": "Tài khoản đã bị vô hiệu hoá."
        case "unauthenticated": "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."
        case "network": "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."
        case "photo_missing", "photo_invalid": "Ảnh không hợp lệ, hãy chọn ảnh khác."
        case "taken_at_future": "Thời gian chụp ảnh không hợp lệ."
        case "not_found": "Không tìm thấy dữ liệu."
        default: message.isEmpty ? "Đã có lỗi xảy ra." : message
        }
    }

    static let unauthenticated = APIError(status: 401, code: "unauthenticated", message: "Missing or invalid token")
    static let malformedURL = APIError(status: 0, code: "bad_url", message: "Địa chỉ máy chủ không hợp lệ.")
    static let malformedResponse = APIError(status: 0, code: "bad_response", message: "Máy chủ trả về phản hồi không hợp lệ.")

    static func network(_ error: URLError) -> APIError {
        APIError(status: 0, code: "network", message: error.localizedDescription)
    }

    static func decoding(_ error: any Error) -> APIError {
        APIError(status: 0, code: "decoding", message: "Dữ liệu trả về không hợp lệ.")
    }
}
