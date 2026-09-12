import Testing
import Foundation
@testable import SkinnyLegend

@Suite("VerdictSheetModel")
@MainActor
struct VerdictSheetModelTests {
    private func entry(_ categories: [SkinnyLegend.Category], status: EntryStatus = .pending) -> EntryDTO {
        EntryDTO(id: "e1", userId: "u1", photoUrl: "mock://photo/1", thumbUrl: "mock://photo/1",
                 takenAt: Date(), localDate: LocalDay.today, status: status, categories: categories,
                 placeName: "Phòng gym California", placeSource: .poi, createdAt: Date())
    }

    /// Built through `Localized` like the model's own copy, so the assertion cannot race the
    /// `.serialized` `LocalizedTests` suite's English windows (`Localized` is process-global).
    private func capWarning(_ category: SkinnyLegend.Category) -> String {
        Localized.string("Đã đủ \(category.label) \(Rulebook.capNoun(for: category)) — mục này không cộng thêm điểm.")
    }

    private func verdict(_ categories: [SkinnyLegend.Category], failed: Bool = false, healthy: Bool? = nil) -> VerdictDTO {
        VerdictDTO(categories: categories, healthy: healthy, confidence: 0.8,
                   reason: failed ? "" : "Ảnh chụp tại phòng gym với hai người.", model: "mock/offline", failed: failed)
    }

    @Test("Starts from the AI's categories and the server's projected points")
    func startsFromServerProjection() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.exercise, .group]), mode: .created(verdict([.exercise, .group])),
            capsHit: CapsHit(exercise: true, meal: false, group: false), cappedCategories: [],
            projectedPoints: 6, placeName: "Phòng gym California", placeSource: .poi
        )
        #expect(model.selected == [.exercise, .group])
        #expect(model.projectedPoints == 6)
        #expect(model.isEditingCategories == false)
        #expect(model.capWarnings.isEmpty)   // this entry filled the exercise cap itself, server says cappedCategories: []
    }

    @Test("Toggling a chip re-projects the points locally")
    func toggleReprojects() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.exercise, .group]), mode: .created(verdict([.exercise, .group])),
            capsHit: CapsHit(exercise: true, meal: false, group: false), cappedCategories: [],
            projectedPoints: 6, placeName: nil, placeSource: PlaceSource.none
        )
        model.toggle(.group)
        #expect(model.selected == [.exercise])
        #expect(model.projectedPoints == 3)

        model.toggle(.meal)
        #expect(model.selected == [.exercise, .meal])
        #expect(model.projectedPoints == 5)
    }

    @Test("A category already capped by earlier entries scores nothing and warns")
    func warnsOnBlockedCategory() {
        // The server projected 0 for a lone exercise, so the cap was filled by another entry,
        // and cappedCategories names exercise as this entry's own capped category.
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.exercise]), mode: .created(verdict([.exercise])),
            capsHit: CapsHit(exercise: true, meal: false, group: false), cappedCategories: [.exercise],
            projectedPoints: 0, placeName: nil, placeSource: PlaceSource.none
        )
        #expect(model.projectedPoints == 0)
        #expect(model.capWarnings == [capWarning(.exercise)])

        model.toggle(.meal)
        #expect(model.projectedPoints == 2)   // meal is not blocked
    }

    @Test("The weekly group cap warns with the week wording")
    func warnsWeekly() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.group]), mode: .created(verdict([.group])),
            capsHit: CapsHit(exercise: false, meal: false, group: true), cappedCategories: [.group],
            projectedPoints: 0, placeName: nil, placeSource: PlaceSource.none
        )
        #expect(model.capWarnings == [capWarning(.group)])
    }

    @Test("A mixed entry blocks only the category the server actually capped")
    func mixedEntryBlocksOnlyItsCappedCategory() {
        // exercise self-fills its own cap and scores; meal was already capped earlier the same
        // day, so only meal comes back in cappedCategories even though capsHit is true for both.
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.exercise, .meal]), mode: .created(verdict([.exercise, .meal])),
            capsHit: CapsHit(exercise: true, meal: true, group: false), cappedCategories: [.meal],
            projectedPoints: 3, placeName: nil, placeSource: PlaceSource.none
        )
        #expect(model.projectedPoints == 3)
        #expect(model.isCapped(.meal))
        #expect(model.isCapped(.exercise) == false)
        #expect(model.capWarnings == [capWarning(.meal)])

        model.toggle(.meal)   // deselect the already-capped meal
        #expect(model.selected == [.exercise])
        #expect(model.projectedPoints == 3)

        model.toggle(.group)   // add group; capsHit.group is false, so it scores
        #expect(model.selected == [.exercise, .group])
        #expect(model.projectedPoints == 6)
    }

    @Test("A failed verdict opens the chip editor with nothing selected")
    func failedVerdictOpensEditor() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([]), mode: .created(verdict([], failed: true)),
            capsHit: CapsHit.none, cappedCategories: [], projectedPoints: 0,
            placeName: nil, placeSource: PlaceSource.none
        )
        #expect(model.selected.isEmpty)
        #expect(model.isEditingCategories)
        #expect(model.projectedPoints == 0)
    }

    @Test("Edit mode starts from the stored entry with no verdict")
    func editMode() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.meal], status: .confirmed), mode: .edit,
            capsHit: CapsHit.none, cappedCategories: [], projectedPoints: 2,
            placeName: "Cơm tấm Ba Ghiền", placeSource: .poi
        )
        #expect(model.selected == [.meal])
        #expect(model.verdict == nil)
        #expect(model.isEditingCategories)
        #expect(model.placeName == "Cơm tấm Ba Ghiền")
    }

    @Test("Confirming PATCHes the entry and reports the confirmed row")
    func confirms() async throws {
        let client = MockAPIClient()
        let created = try await client.createEntry(
            CreateEntryInput(photoKey: "photos/x.jpg", takenAt: Date(), lat: nil, lng: nil, placeName: nil, placeSource: nil)
        )
        let model = VerdictSheetModel(
            api: client, entry: created.entry, mode: .created(created.verdict),
            capsHit: created.capsHit, cappedCategories: created.cappedCategories,
            projectedPoints: created.projectedPoints, placeName: nil, placeSource: PlaceSource.none
        )
        model.applyPlace(name: "Hồ bơi Lam Sơn", source: .manual)
        let confirmed = await model.confirm()
        let entry = try #require(confirmed)
        #expect(entry.status == .confirmed)
        #expect(entry.placeName == "Hồ bơi Lam Sơn")
        #expect(entry.placeSource == .manual)
        #expect(model.errorMessage == nil)
        #expect(model.confirmedEntry?.id == entry.id)
    }

    @Test("A failed PATCH surfaces the error and leaves the sheet open")
    func surfacesConfirmError() async {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.exercise]), mode: .edit,
            capsHit: CapsHit.none, cappedCategories: [], projectedPoints: 3,
            placeName: nil, placeSource: PlaceSource.none
        )
        // "e1" is not in the mock store, so the PATCH 404s.
        let confirmed = await model.confirm()
        #expect(confirmed == nil)
        #expect(model.errorMessage == Localized.string("Không tìm thấy dữ liệu."))
        #expect(model.confirmedEntry == nil)
    }

    // MARK: - Ruling 2: history edits have no fresh server projection until save

    @Test("An edit-mode sheet ignores caller-supplied caps before save and reflects the PATCH response after")
    func editModeIgnoresCallerCapsBeforeSaveAndReflectsResponseAfter() async throws {
        // "today" is pinned far outside the seed window so this test's own entries are the only
        // ones scored that day — the seed data cannot accidentally pre-cap exercise for "me".
        let client = MockAPIClient(today: "2026-01-01")
        let takenAt = Date()

        let first = try await client.createEntry(
            CreateEntryInput(photoKey: "photos/a.jpg", takenAt: takenAt, lat: nil, lng: nil, placeName: nil, placeSource: nil)
        )
        _ = try await client.confirmEntry(
            id: first.entry.id, ConfirmEntryInput(categories: [.exercise], placeName: nil, placeSource: PlaceSource.none)
        )

        let second = try await client.createEntry(
            CreateEntryInput(photoKey: "photos/b.jpg", takenAt: takenAt, lat: nil, lng: nil, placeName: nil, placeSource: nil)
        )
        let model = VerdictSheetModel(
            api: client, entry: second.entry, mode: .edit,
            // Falsified as if real (ruling 2) — the model must ignore these before save.
            capsHit: CapsHit(exercise: true, meal: true, group: true), cappedCategories: [.exercise, .meal, .group],
            projectedPoints: 999, placeName: nil, placeSource: PlaceSource.none
        )
        // Toggle to exactly [.exercise], regardless of whichever categories the mock's
        // deterministic "AI" suggestion pre-selected.
        let desired: Set<SkinnyLegend.Category> = [.exercise]
        for category in Category.allCases where model.selected.contains(category) != desired.contains(category) {
            model.toggle(category)
        }
        #expect(model.selected == [.exercise])
        #expect(model.capWarnings.isEmpty)
        #expect(!model.isCapped(.exercise))
        #expect(model.hasConfirmedProjection == false)

        // Exercise's daily cap (1/day) is already filled by `first`, so the PATCH should report it capped.
        let confirmed = try #require(await model.confirm())
        #expect(confirmed.categories == [.exercise])
        #expect(model.errorMessage == nil)
        #expect(model.projectedPoints == 0)
        #expect(model.isCapped(.exercise))
        #expect(model.capWarnings == [capWarning(.exercise)])
        #expect(model.hasConfirmedProjection == true)
    }
}
