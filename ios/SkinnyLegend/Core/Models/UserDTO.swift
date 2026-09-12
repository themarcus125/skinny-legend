import Foundation

/// The full `users` row, as returned by `POST /auth/session`, `GET /me` and `PATCH /me`.
struct UserDTO: Codable, Identifiable, Hashable, Sendable {
    enum Role: String, Codable, Sendable { case member, admin }
    enum Status: String, Codable, Sendable { case pending, active, disabled }
    /// Mirrors the API `user_locale` enum (`packages/shared/src/db/schema.ts`). This is the
    /// *persisted* preference — a concrete language — and is distinct from the app-side
    /// `AppLocale`, whose `.system` case is resolved to one of these before it is sent.
    enum Locale: String, Codable, Sendable { case vi, en }

    let id: String
    let firebaseUid: String
    let displayName: String
    let avatarKey: String?
    let role: Role
    let status: Status
    /// `not null default 'vi'` server-side, so never optional here.
    let locale: Locale
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
