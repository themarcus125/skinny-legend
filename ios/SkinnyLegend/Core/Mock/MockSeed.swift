import Foundation

/// Deterministic offline data: five active members and roughly two weeks of entries, so every
/// screen has something real to draw before a backend exists (spec §14).
enum MockSeed {
    static let me = UserDTO(
        id: "11111111-1111-4111-8111-111111111111",
        firebaseUid: "mock-me",
        displayName: "Khoa",
        avatarKey: nil,
        role: .member,
        status: .active,
        createdAt: Date(timeIntervalSince1970: 1_788_600_000)
    )

    static let others: [UserDTO] = [
        UserDTO(id: "22222222-2222-4222-8222-22222222aaaa", firebaseUid: "mock-linh", displayName: "Linh", avatarKey: nil, role: .member, status: .active, createdAt: Date(timeIntervalSince1970: 1_788_600_100)),
        UserDTO(id: "33333333-3333-4333-8333-33333333bbbb", firebaseUid: "mock-tuan", displayName: "Tuấn", avatarKey: nil, role: .member, status: .active, createdAt: Date(timeIntervalSince1970: 1_788_600_200)),
        UserDTO(id: "44444444-4444-4444-8444-44444444cccc", firebaseUid: "mock-mai", displayName: "Mai", avatarKey: nil, role: .member, status: .active, createdAt: Date(timeIntervalSince1970: 1_788_600_300)),
        UserDTO(id: "55555555-5555-4555-8555-55555555dddd", firebaseUid: "mock-duc", displayName: "Đức", avatarKey: nil, role: .member, status: .active, createdAt: Date(timeIntervalSince1970: 1_788_600_400)),
    ]

    static var members: [UserDTO] { [me] + others }

    static let places = [
        "Phòng gym California Fitness",
        "Sân cầu lông Tân Bình",
        "Công viên Gia Định",
        "Cơm tấm Ba Ghiền",
        "Hồ bơi Lam Sơn",
        "Bún chả Hương Liên",
    ]

    /// One coordinate per name in `places`, so the mock map screen (`MockAPIClient.mapPins`) has
    /// something real to plot over Ho Chi Minh City.
    static let placeCoordinates: [String: GeoPoint] = [
        "Phòng gym California Fitness": GeoPoint(lat: 10.7769, lng: 106.7009),
        "Sân cầu lông Tân Bình": GeoPoint(lat: 10.8010, lng: 106.6520),
        "Công viên Gia Định": GeoPoint(lat: 10.8122, lng: 106.6740),
        "Cơm tấm Ba Ghiền": GeoPoint(lat: 10.7890, lng: 106.6910),
        "Hồ bơi Lam Sơn": GeoPoint(lat: 10.7830, lng: 106.6950),
        "Bún chả Hương Liên": GeoPoint(lat: 10.7740, lng: 106.7030),
    ]

    /// Category patterns per weekday index, rotated per member. Index 0 = Monday. Every member
    /// gets exactly two entries every day in the window, which keeps the paging tests meaningful
    /// however few days of the challenge have elapsed.
    private static let morningPatterns: [[Category]] = [
        [.exercise],
        [.exercise, .group],
        [.exercise],
        [.exercise, .meal],
        [.exercise],
        [.group],
        [.exercise],
    ]

    private static let eveningPatterns: [[Category]] = [
        [.meal],
        [.meal],
        [.meal, .group],
        [.meal],
        [.meal],
        [.meal],
        [.meal, .group],
    ]

    struct SeedEntry: Sendable {
        let id: String
        let userId: String
        let localDate: LocalDate
        let takenAt: Date
        let categories: [Category]
        let placeName: String?
        let placeSource: PlaceSource
        let photoKey: String
    }

    /// Up to fourteen days ending today, clamped to the challenge window, two entries per member per day.
    static func entries(today: LocalDate = LocalDay.today) -> [SeedEntry] {
        let end = min(max(today, Rulebook.challengeStart), Rulebook.challengeEnd)
        let start = max(Rulebook.challengeStart, LocalDay.adding(-13, to: end))
        var result: [SeedEntry] = []
        var counter = 0

        for (memberIndex, member) in members.enumerated() {
            for day in LocalDay.each(from: start, to: end) {
                let slot = (LocalDay.weekdayIndex(day) + memberIndex) % 7
                let anchor = LocalDay.date(from: day) ?? Date()
                for (offsetHours, pattern) in [(-5, morningPatterns[slot]), (7, eveningPatterns[slot])] {
                    counter += 1
                    // Anchors are noon local, so -5 h is a morning entry and +7 h an evening one.
                    let takenAt = LocalDay.calendar.date(byAdding: .minute, value: offsetHours * 60 + memberIndex * 7, to: anchor) ?? anchor
                    let place = places[(counter + memberIndex) % places.count]
                    result.append(SeedEntry(
                        id: String(format: "aaaaaaaa-0000-4000-8000-%012d", counter),
                        userId: member.id,
                        localDate: day,
                        takenAt: takenAt,
                        categories: pattern,
                        placeName: counter % 4 == 0 ? nil : place,
                        placeSource: counter % 4 == 0 ? PlaceSource.none : .poi,
                        photoKey: "photos/\(member.id)/seed-\(counter).jpg"
                    ))
                }
            }
        }
        return result.sorted { $0.takenAt > $1.takenAt }
    }
}
