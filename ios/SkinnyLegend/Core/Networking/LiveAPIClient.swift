import Foundation
import OSLog

/// URLSession implementation of `APIClient`. Every request carries the Firebase ID token as a
/// Bearer header (spec §3); failures come back as `APIError`.
struct LiveAPIClient: APIClient {
    private let baseURL: URL
    private let tokenProvider: TokenProvider
    /// Named `urlSession` because `session()` is also an API call on this type.
    private let urlSession: URLSession
    private let log = Logger(subsystem: "com.themarcus125.skinnylegend", category: "api")

    /// `POST /entries` waits on the vision model (8 s server-side budget), so it gets its own timeout.
    private static let defaultTimeout: TimeInterval = 30
    private static let visionTimeout: TimeInterval = 45

    init(baseURL: URL, tokenProvider: @escaping TokenProvider, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        self.urlSession = urlSession
    }

    // MARK: - Auth & profile

    func session() async throws -> UserDTO {
        try await send(UserEnvelope.self, "POST", "/auth/session").user
    }

    func me() async throws -> UserDTO {
        try await send(UserEnvelope.self, "GET", "/me").user
    }

    func updateMe(displayName: String?, avatarKey: String?) async throws -> UserDTO {
        struct Body: Encodable {
            let displayName: String?
            let avatarKey: String?
        }
        guard displayName != nil || avatarKey != nil else { return try await me() }
        return try await send(UserEnvelope.self, "PATCH", "/me", body: Body(displayName: displayName, avatarKey: avatarKey)).user
    }

    // MARK: - Uploads

    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO {
        struct Body: Encodable {
            let kind: String
            let contentType: String
        }
        return try await send(PresignDTO.self, "POST", "/uploads/presign", body: Body(kind: kind.rawValue, contentType: contentType))
    }

    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws {
        guard let url = URL(string: presign.url) else { throw APIError.malformedURL }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60
        do {
            let (body, response) = try await urlSession.upload(for: request, from: data, delegate: UploadProgressDelegate(onProgress: onProgress))
            guard let http = response as? HTTPURLResponse else { throw APIError.malformedResponse }
            guard (200..<300).contains(http.statusCode) else { throw APIError(status: http.statusCode, data: body) }
            onProgress(1)
        } catch let error as APIError {
            throw error
        } catch let error as URLError {
            throw APIError.network(error)
        }
    }

    // MARK: - Entries

    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse {
        try await send(CreateEntryResponse.self, "POST", "/entries", body: input, timeout: Self.visionTimeout)
    }

    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse {
        try await send(ConfirmEntryResponse.self, "PATCH", "/entries/\(id)", body: input)
    }

    func deleteEntry(id: String) async throws {
        _ = try await perform(makeRequest("DELETE", "/entries/\(id)"))
    }

    func myEntries(cursor: String?) async throws -> HistoryPage {
        try await send(HistoryPage.self, "GET", "/entries/mine", query: cursorQuery(cursor))
    }

    // MARK: - Read models

    func dashboard() async throws -> DashboardDTO {
        try await send(DashboardDTO.self, "GET", "/me/dashboard")
    }

    func leaderboard() async throws -> [LeaderboardRow] {
        try await send(LeaderboardEnvelope.self, "GET", "/leaderboard").leaderboard
    }

    func trends() async throws -> TrendsDTO {
        try await send(TrendsDTO.self, "GET", "/me/trends")
    }

    func feed(cursor: String?) async throws -> FeedPage {
        try await send(FeedPage.self, "GET", "/feed", query: cursorQuery(cursor))
    }

    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage {
        try await send(EntryPage.self, "GET", "/users/\(userID)/entries", query: cursorQuery(cursor))
    }

    func mapPins(days: Int) async throws -> MapPinsPage {
        try await send(MapPinsPage.self, "GET", "/entries/map", query: [URLQueryItem(name: "days", value: String(days))])
    }

    // MARK: - Feedback

    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws {
        struct Body: Encodable {
            let message: String
            let screenshotKey: String?
            let appVersion: String
        }
        _ = try await send(FeedbackEnvelope.self, "POST", "/feedback", body: Body(message: message, screenshotKey: screenshotKey, appVersion: appVersion))
    }

    // MARK: - Plumbing

    private func cursorQuery(_ cursor: String?) -> [URLQueryItem] {
        cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? []
    }

    private func makeRequest(_ method: String, _ path: String, query: [URLQueryItem] = [], timeout: TimeInterval = defaultTimeout) -> URLRequest {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        var request = URLRequest(url: components?.url ?? baseURL.appending(path: path))
        request.httpMethod = method
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        var authorized = request
        authorized.setValue("Bearer \(try await tokenProvider())", forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await urlSession.data(for: authorized)
            guard let http = response as? HTTPURLResponse else { throw APIError.malformedResponse }
            guard (200..<300).contains(http.statusCode) else {
                let error = APIError(status: http.statusCode, data: data)
                log.error("\(authorized.httpMethod ?? "?", privacy: .public) \(request.url?.path ?? "", privacy: .public) → \(http.statusCode) \(error.code, privacy: .public)")
                throw error
            }
            return data
        } catch let error as APIError {
            throw error
        } catch let error as URLError {
            throw APIError.network(error)
        }
    }

    /// Bodyless verbs.
    private func send<T: Decodable>(
        _ type: T.Type,
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        timeout: TimeInterval = defaultTimeout
    ) async throws -> T {
        try await decode(T.self, from: perform(makeRequest(method, path, query: query, timeout: timeout)))
    }

    /// Verbs that carry a JSON body.
    private func send<T: Decodable, Body: Encodable>(
        _ type: T.Type,
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        body: Body,
        timeout: TimeInterval = defaultTimeout
    ) async throws -> T {
        var request = makeRequest(method, path, query: query, timeout: timeout)
        request.httpBody = try JSONCoding.makeEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await decode(T.self, from: perform(request))
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONCoding.makeDecoder().decode(T.self, from: data)
        } catch {
            log.error("Decoding \(String(describing: T.self), privacy: .public) failed: \(String(describing: error), privacy: .public)")
            throw APIError.decoding(error)
        }
    }
}

/// Per-task delegate that reports PUT upload progress for the Track screen's progress bar.
private final class UploadProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let onProgress: @Sendable (Double) -> Void

    init(onProgress: @escaping @Sendable (Double) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend)))
    }
}
