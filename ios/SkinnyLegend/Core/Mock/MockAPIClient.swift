import Foundation

/// In-memory `APIClient`. Holds mutable state in an actor so Track can create, confirm and delete
/// entries offline and see every other tab update accordingly.
actor MockAPIClient: APIClient {
    private struct StoredEntry {
        var id: String
        var userId: String
        var localDate: LocalDate
        var takenAt: Date
        var categories: [Category]
        var status: EntryStatus
        var placeName: String?
        var placeSource: PlaceSource
        var photoKey: String
        var createdAt: Date
    }

    private var profile: UserDTO
    private var members: [UserDTO]
    private var store: [StoredEntry]
    private var uploads: Set<String> = []
    private var devices: [String: DeviceDTO] = [:]
    private let historyPageSize: Int
    private let feedPageSize = 30
    private var nextID = 1
    /// The mock's notion of "today", frozen for tests so scoring never depends on the wall clock
    /// (Task 2 controller ruling); defaults to the real local day in production.
    private let today: LocalDate
    /// Injected failure for `updateMe`, so a dropped `PATCH /me` can be exercised offline.
    private let updateMeError: (any Error)?

    init(historyPageSize: Int = 50, today: LocalDate = LocalDay.today, updateMeError: (any Error)? = nil) {
        self.historyPageSize = historyPageSize
        self.today = today
        self.updateMeError = updateMeError
        self.profile = MockSeed.me
        self.members = MockSeed.members
        self.store = MockSeed.entries(today: today).map {
            StoredEntry(id: $0.id, userId: $0.userId, localDate: $0.localDate, takenAt: $0.takenAt,
                        categories: $0.categories, status: .confirmed, placeName: $0.placeName,
                        placeSource: $0.placeSource, photoKey: $0.photoKey, createdAt: $0.takenAt)
        }
    }

    // MARK: - Auth & profile

    func session() async throws -> UserDTO { profile }
    func me() async throws -> UserDTO { profile }

    func updateMe(displayName: String?, avatarKey: String?, locale: UserDTO.Locale?) async throws -> UserDTO {
        if let updateMeError { throw updateMeError }
        profile = UserDTO(
            id: profile.id,
            firebaseUid: profile.firebaseUid,
            displayName: displayName ?? profile.displayName,
            avatarKey: avatarKey ?? profile.avatarKey,
            role: profile.role,
            status: profile.status,
            locale: locale ?? profile.locale,
            createdAt: profile.createdAt
        )
        members = members.map { $0.id == profile.id ? profile : $0 }
        return profile
    }

    // MARK: - Uploads

    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO {
        nextID += 1
        let key = "\(kind.rawValue)s/\(profile.id)/mock-\(nextID).jpg"
        return PresignDTO(key: key, url: "mock://upload/\(key)", expiresAt: Date().addingTimeInterval(300))
    }

    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws {
        for step in 1...4 {
            try? await Task.sleep(for: .milliseconds(120))
            onProgress(Double(step) / 4)
        }
        uploads.insert(presign.key)
    }

    // MARK: - Entries

    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse {
        try? await Task.sleep(for: .milliseconds(700))   // stands in for the vision call
        nextID += 1
        let day = LocalDay.string(from: input.takenAt)
        // A deterministic pretend verdict so the sheet always has categories and a reason to show.
        let suggested: [Category] = nextID % 3 == 0 ? [.meal] : [.exercise, .group]
        let stored = StoredEntry(
            id: String(format: "bbbbbbbb-0000-4000-8000-%012d", nextID),
            userId: profile.id,
            localDate: day,
            takenAt: input.takenAt,
            categories: suggested,
            status: .pending,
            placeName: input.placeName,
            placeSource: input.placeSource ?? (input.placeName == nil ? PlaceSource.none : .manual),
            photoKey: input.photoKey,
            createdAt: Date()
        )
        store.insert(stored, at: 0)
        let verdict = VerdictDTO(
            categories: suggested,
            healthy: suggested.contains(.meal) ? true : nil,
            confidence: 0.84,
            reason: suggested.contains(.meal) ? "Bữa ăn nhiều rau và protein nạc." : "Ảnh chụp tại nơi tập luyện với hai người.",
            model: "mock/offline",
            failed: false
        )
        let projection = project(entryID: stored.id, categories: Set(suggested), on: day)
        return CreateEntryResponse(
            entry: dto(stored), verdict: verdict, projectedPoints: projection.points,
            capsHit: projection.caps, cappedCategories: projection.cappedCategories
        )
    }

    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse {
        guard let index = store.firstIndex(where: { $0.id == id && $0.userId == profile.id && $0.status != .rejected }) else {
            throw APIError(status: 404, code: "not_found", message: "Entry not found")
        }
        store[index].categories = input.categories
        store[index].status = .confirmed
        store[index].placeName = input.placeName
        store[index].placeSource = input.placeSource
        let stored = store[index]
        let projection = project(entryID: id, categories: Set(input.categories), on: stored.localDate)
        return ConfirmEntryResponse(
            entry: dto(stored), projectedPoints: projection.points,
            capsHit: projection.caps, cappedCategories: projection.cappedCategories
        )
    }

    func deleteEntry(id: String) async throws {
        guard let index = store.firstIndex(where: { $0.id == id && $0.userId == profile.id }) else {
            throw APIError(status: 404, code: "not_found", message: "Entry not found")
        }
        store[index].status = .rejected
    }

    func myEntries(cursor: String?) async throws -> HistoryPage {
        let score = MockScoring.compute(entries: scoringInputs(for: profile.id), asOf: today)
        let visible = store
            .filter { $0.userId == profile.id && $0.status != .rejected }
            .sorted { $0.takenAt > $1.takenAt }
        let page = paginate(visible, cursor: cursor, size: historyPageSize)
        let rows = page.items.map { stored -> HistoryEntryDTO in
            let scored = score.scored.filter { $0.entryID == stored.id }
            return HistoryEntryDTO(
                id: stored.id, userId: stored.userId, photoUrl: photoURL(stored), thumbUrl: photoURL(stored),
                takenAt: stored.takenAt, localDate: stored.localDate, status: stored.status,
                categories: stored.categories, placeName: stored.placeName, placeSource: stored.placeSource,
                createdAt: stored.createdAt,
                points: scored.reduce(0) { $0 + $1.points },
                capped: scored.contains { $0.capped }
            )
        }
        return HistoryPage(entries: rows, nextCursor: page.nextCursor)
    }

    // MARK: - Read models

    func dashboard() async throws -> DashboardDTO {
        let board = scoreboard(asOf: today)
        guard let mine = board.first(where: { $0.user.id == profile.id }) else {
            throw APIError(status: 404, code: "not_found", message: "Member not found")
        }
        let todayScore = mine.score.byDay[today] ?? MockScoring.DayScore(points: 0, categories: [])
        let yesterdayScore = mine.score.byDay[LocalDay.adding(-1, to: today)] ?? MockScoring.DayScore(points: 0, categories: [])
        return DashboardDTO(
            today: DayPoints(points: todayScore.points, categories: todayScore.categories),
            yesterday: YesterdayPoints(points: yesterdayScore.points),
            deltaVsYesterday: todayScore.points - yesterdayScore.points,
            streak: mine.score.streak,
            total: mine.score.total,
            rank: mine.rank,
            memberCount: board.count,
            capsHit: mine.score.capsHit,
            remaining: Category.allCases.filter { !mine.score.capsHit[$0] }
        )
    }

    func leaderboard() async throws -> [LeaderboardRow] {
        let week = LocalDay.isoWeekKey(today)
        return scoreboard(asOf: today).map { row in
            LeaderboardRow(
                rank: row.rank,
                user: summary(row.user),
                total: row.score.total,
                weekPoints: row.score.byDay.filter { LocalDay.isoWeekKey($0.key) == week }.values.reduce(0) { $0 + $1.points },
                isMe: row.user.id == profile.id
            )
        }
    }

    func trends() async throws -> TrendsDTO {
        let board = scoreboard(asOf: today)
        guard let mine = board.first(where: { $0.user.id == profile.id }) else {
            throw APIError(status: 404, code: "not_found", message: "Member not found")
        }

        var weekKeys: [String] = []
        var cursor = Rulebook.challengeStart
        while cursor <= today {
            let key = LocalDay.isoWeekKey(cursor)
            if !weekKeys.contains(key) { weekKeys.append(key) }
            cursor = LocalDay.adding(7, to: cursor)
        }
        if !weekKeys.contains(LocalDay.isoWeekKey(today)) { weekKeys.append(LocalDay.isoWeekKey(today)) }

        let weeks = weekKeys.suffix(8).map { week -> TrendWeek in
            let perUser = board.map { row in
                row.score.byDay.filter { LocalDay.isoWeekKey($0.key) == week }.values.reduce(0) { $0 + $1.points }
            }
            let minePoints = mine.score.byDay.filter { LocalDay.isoWeekKey($0.key) == week }.values.reduce(0) { $0 + $1.points }
            let average = perUser.isEmpty ? 0 : Double(perUser.reduce(0, +)) / Double(perUser.count)
            return TrendWeek(week: week, mine: minePoints, groupAvg: average, rank: 1 + perUser.filter { $0 > minePoints }.count)
        }

        let heatmap = mine.score.byDay
            .map { HeatmapDay(date: $0.key, points: $0.value.points) }
            .sorted { $0.date < $1.date }
        return TrendsDTO(weeks: Array(weeks), heatmap: heatmap, byCategory: mine.score.byCategory, streakBonus: mine.score.streakBonus)
    }

    func feed(cursor: String?) async throws -> FeedPage {
        let visible = store.filter { $0.status == .confirmed }.sorted { $0.createdAt > $1.createdAt }
        let page = paginate(visible, cursor: cursor, size: feedPageSize, key: \.createdAt)
        let rows = page.items.compactMap { stored -> FeedEntryDTO? in
            guard let author = members.first(where: { $0.id == stored.userId }) else { return nil }
            return FeedEntryDTO(
                id: stored.id, userId: stored.userId, photoUrl: photoURL(stored), thumbUrl: photoURL(stored),
                takenAt: stored.takenAt, localDate: stored.localDate, status: stored.status,
                categories: stored.categories, placeName: stored.placeName, placeSource: stored.placeSource,
                createdAt: stored.createdAt, user: summary(author)
            )
        }
        return FeedPage(entries: rows, nextCursor: page.nextCursor)
    }

    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage {
        let visible = store.filter { $0.userId == userID && $0.status == .confirmed }.sorted { $0.takenAt > $1.takenAt }
        let page = paginate(visible, cursor: cursor, size: historyPageSize)
        return EntryPage(entries: page.items.map(dto), nextCursor: page.nextCursor)
    }

    func mapPins(days: Int) async throws -> MapPinsPage {
        let since = LocalDay.adding(-days, to: today)
        let pins = store
            .filter { $0.status == .confirmed && $0.localDate >= since }
            .sorted { $0.takenAt > $1.takenAt }
            .compactMap { stored -> MapPinDTO? in
                guard let placeName = stored.placeName, let point = MockSeed.placeCoordinates[placeName],
                      let author = members.first(where: { $0.id == stored.userId }) else { return nil }
                return MapPinDTO(
                    entryId: stored.id, lat: point.lat, lng: point.lng, placeName: placeName,
                    takenAt: stored.takenAt, localDate: stored.localDate, categories: stored.categories,
                    thumbUrl: photoURL(stored), user: summary(author)
                )
            }
        return MapPinsPage(pins: pins)
    }

    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws {
        try? await Task.sleep(for: .milliseconds(300))
    }

    // MARK: - Push devices

    func registerDevice(token: String, platform: DevicePlatform, locale: DeviceLocale) async throws {
        devices[token] = DeviceDTO(id: "device-\(devices.count + 1)", token: token,
                                   platform: platform.rawValue, locale: locale.rawValue,
                                   createdAt: Date(), lastSeenAt: Date())
    }

    func unregisterDevice(token: String) async throws {
        devices.removeValue(forKey: token)
    }

    /// Test-only view of what the app registered. Sorted so assertions are order-independent.
    func registeredTokens() -> [String] {
        devices.keys.sorted()
    }

    // MARK: - Helpers

    private func photoURL(_ stored: StoredEntry) -> String { "mock://photo/\(stored.photoKey)" }

    private func summary(_ user: UserDTO) -> UserSummary {
        UserSummary(id: user.id, displayName: user.displayName, avatarUrl: user.avatarKey.map { "mock://avatar/\($0)" })
    }

    private func dto(_ stored: StoredEntry) -> EntryDTO {
        EntryDTO(id: stored.id, userId: stored.userId, photoUrl: photoURL(stored), thumbUrl: photoURL(stored),
                 takenAt: stored.takenAt, localDate: stored.localDate, status: stored.status,
                 categories: stored.categories, placeName: stored.placeName, placeSource: stored.placeSource,
                 createdAt: stored.createdAt)
    }

    private func scoringInputs(for userID: String) -> [MockScoring.Input] {
        store
            .filter { $0.userId == userID && $0.status == .confirmed }
            .map { MockScoring.Input(id: $0.id, localDate: $0.localDate, takenAt: $0.takenAt, categories: $0.categories) }
    }

    private struct BoardRow {
        let user: UserDTO
        let score: MockScoring.Result
        var rank: Int
    }

    private func scoreboard(asOf: LocalDate) -> [BoardRow] {
        var rows = members
            .map { BoardRow(user: $0, score: MockScoring.compute(entries: scoringInputs(for: $0.id), asOf: asOf), rank: 0) }
            .sorted { left, right in
                if left.score.total != right.score.total { return left.score.total > right.score.total }
                return left.user.displayName.localizedCompare(right.user.displayName) == .orderedAscending
            }
        for index in rows.indices {
            rows[index].rank = 1 + rows.filter { $0.score.total > rows[index].score.total }.count
        }
        return rows
    }

    /// Points this entry would earn if confirmed with `categories`, plus caps for its own day/week,
    /// plus which of this entry's own categories scored 0 because their cap was already full.
    private func project(entryID: String, categories: Set<Category>, on day: LocalDate) -> (points: Int, caps: CapsHit, cappedCategories: [Category]) {
        var inputs = scoringInputs(for: profile.id).filter { $0.id != entryID }
        let takenAt = store.first { $0.id == entryID }?.takenAt ?? Date()
        inputs.append(MockScoring.Input(id: entryID, localDate: day, takenAt: takenAt, categories: Array(categories)))
        let result = MockScoring.compute(entries: inputs, asOf: max(today, day))
        let ownRows = result.scored.filter { $0.entryID == entryID }
        let points = ownRows.reduce(0) { $0 + $1.points }
        let cappedCategories = ownRows.filter { $0.capped }.map { $0.category }

        let dayByEntry = Dictionary(inputs.map { ($0.id, $0.localDate) }, uniquingKeysWith: { first, _ in first })
        var caps: [Category: Bool] = [:]
        for rule in Rulebook.rules {
            let target = rule.capPeriod == .day ? day : LocalDay.isoWeekKey(day)
            let count = result.scored.filter { scored in
                guard scored.category == rule.category, scored.points > 0, let entryDay = dayByEntry[scored.entryID] else { return false }
                return (rule.capPeriod == .day ? entryDay : LocalDay.isoWeekKey(entryDay)) == target
            }.count
            caps[rule.category] = count >= rule.capCount
        }
        return (points, CapsHit(exercise: caps[.exercise] ?? false, meal: caps[.meal] ?? false, group: caps[.group] ?? false), cappedCategories)
    }

    private func paginate(
        _ items: [StoredEntry],
        cursor: String?,
        size: Int,
        key: KeyPath<StoredEntry, Date> = \.takenAt
    ) -> (items: [StoredEntry], nextCursor: String?) {
        var remaining = items
        if let cursor, let bound = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(cursor) {
            remaining = remaining.filter { $0[keyPath: key] < bound }
        }
        let page = Array(remaining.prefix(size))
        let next = page.count == size
            ? Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(page[page.count - 1][keyPath: key])
            : nil
        return (page, next)
    }
}
