import Foundation

/// The full `users` row, as returned by `POST /auth/session`, `GET /me` and `PATCH /me`.
struct UserDTO: Codable, Identifiable, Hashable, Sendable {
    enum Role: String, Codable, Sendable { case member, admin }
    enum Status: String, Codable, Sendable { case pending, active, disabled }

    let id: String
    let firebaseUid: String
    let displayName: String
    let avatarKey: String?
    let role: Role
    let status: Status
    let createdAt: Date
}

struct UserEnvelope: Codable, Sendable {
    let user: UserDTO
}

/// The trimmed author shape the read models embed (`read.ts` `userDto`).
struct UserSummary: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let displayName: String
    let avatarUrl: String?
}
