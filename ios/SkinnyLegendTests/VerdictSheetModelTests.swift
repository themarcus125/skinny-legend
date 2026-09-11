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

    private func verdict(_ categories: [SkinnyLegend.Category], failed: Bool = false, healthy: Bool? = nil) -> VerdictDTO {
        VerdictDTO(categories: categories, healthy: healthy, confidence: 0.8,
                   reason: failed ? "" : "Ảnh chụp tại phòng gym với hai người.", model: "mock/offline", failed: failed)
    }

    @Test("Starts from the AI's categories and the server's projected points")
    func startsFromServerProjection() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.exercise, .group]), mode: .created(verdict([.exercise, .group])),
            capsHit: CapsHit(exercise: true, meal: false, group: false), projectedPoints: 6,
            placeName: "Phòng gym California", placeSource: .poi
        )
        #expect(model.selected == [.exercise, .group])
        #expect(model.projectedPoints == 6)
        #expect(model.isEditingCategories == false)
        #expect(model.capWarnings.isEmpty)   // this entry filled the exercise cap itself
    }

    @Test("Toggling a chip re-projects the points locally")
    func toggleReprojects() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.exercise, .group]), mode: .created(verdict([.exercise, .group])),
            capsHit: CapsHit(exercise: true, meal: false, group: false), projectedPoints: 6,
            placeName: nil, placeSource: PlaceSource.none
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
        // The server projected 0 for a lone exercise, so the cap was filled by another entry.
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.exercise]), mode: .created(verdict([.exercise])),
            capsHit: CapsHit(exercise: true, meal: false, group: false), projectedPoints: 0,
            placeName: nil, placeSource: PlaceSource.none
        )
        #expect(model.projectedPoints == 0)
        #expect(model.capWarnings == ["Đã đủ Tập luyện hôm nay — mục này không cộng thêm điểm."])

        model.toggle(.meal)
        #expect(model.projectedPoints == 2)   // meal is not blocked
    }

    @Test("The weekly group cap warns with the week wording")
    func warnsWeekly() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.group]), mode: .created(verdict([.group])),
            capsHit: CapsHit(exercise: false, meal: false, group: true), projectedPoints: 0,
            placeName: nil, placeSource: PlaceSource.none
        )
        #expect(model.capWarnings == ["Đã đủ Hoạt động nhóm tuần này — mục này không cộng thêm điểm."])
    }

    @Test("A failed verdict opens the chip editor with nothing selected")
    func failedVerdictOpensEditor() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([]), mode: .created(verdict([], failed: true)),
            capsHit: CapsHit.none, projectedPoints: 0, placeName: nil, placeSource: PlaceSource.none
        )
        #expect(model.selected.isEmpty)
        #expect(model.isEditingCategories)
        #expect(model.projectedPoints == 0)
    }

    @Test("Edit mode starts from the stored entry with no verdict")
    func editMode() {
        let model = VerdictSheetModel(
            api: MockAPIClient(), entry: entry([.meal], status: .confirmed), mode: .edit,
            capsHit: CapsHit.none, projectedPoints: 2, placeName: "Cơm tấm Ba Ghiền", placeSource: .poi
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
            capsHit: created.capsHit, projectedPoints: created.projectedPoints,
            placeName: nil, placeSource: PlaceSource.none
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
            capsHit: CapsHit.none, projectedPoints: 3, placeName: nil, placeSource: PlaceSource.none
        )
        // "e1" is not in the mock store, so the PATCH 404s.
        let confirmed = await model.confirm()
        #expect(confirmed == nil)
        #expect(model.errorMessage == "Không tìm thấy dữ liệu.")
        #expect(model.confirmedEntry == nil)
    }
}
