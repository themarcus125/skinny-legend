import Foundation
import Observation

/// Backs the verdict sheet for both a freshly created entry and a retroactive history edit
/// (spec §7 Track and Account). Confirming always calls `PATCH /entries/:id`.
@MainActor
@Observable
final class VerdictSheetModel: Identifiable {
    enum Mode: Equatable {
        /// Just created by `POST /entries`; the AI verdict is shown above the chips.
        case created(VerdictDTO)
        /// Opened from history; there is no fresh verdict to show.
        case edit
    }

    private let api: any APIClient
    private let initialSelection: Set<Category>
    private let serverProjectedPoints: Int
    private let capsHit: CapsHit

    let id: String
    let entry: EntryDTO
    let mode: Mode

    private(set) var selected: Set<Category>
    var isEditingCategories: Bool
    private(set) var placeName: String?
    private(set) var placeSource: PlaceSource
    private(set) var isSaving = false
    private(set) var errorMessage: String?
    private(set) var confirmedEntry: EntryDTO?

    init(
        api: any APIClient,
        entry: EntryDTO,
        mode: Mode,
        capsHit: CapsHit,
        projectedPoints: Int,
        placeName: String?,
        placeSource: PlaceSource
    ) {
        self.api = api
        self.id = entry.id
        self.entry = entry
        self.mode = mode
        self.capsHit = capsHit
        self.serverProjectedPoints = projectedPoints
        self.placeName = placeName
        self.placeSource = placeSource

        let starting: Set<Category>
        switch mode {
        case .created(let verdict): starting = Set(verdict.failed ? [] : entry.categories)
        case .edit: starting = Set(entry.categories)
        }
        self.selected = starting
        self.initialSelection = starting

        // The editor opens straight away when there is nothing useful to confirm: a failed
        // verdict, an empty suggestion, or a history edit.
        switch mode {
        case .created(let verdict): self.isEditingCategories = verdict.failed || starting.isEmpty
        case .edit: self.isEditingCategories = true
        }
    }

    var verdict: VerdictDTO? {
        if case .created(let verdict) = mode { return verdict }
        return nil
    }

    /// Categories that cannot earn points for this entry. The server's `capsHit` counts *this*
    /// entry, so a cap this entry filled itself is not a block — detected by comparing the
    /// server's projection with the uncapped value of its own suggestion.
    private var blockedCategories: Set<Category> {
        let uncapped = Rulebook.projectedPoints(for: initialSelection, capped: [])
        return serverProjectedPoints == uncapped
            ? capsHit.cappedSet.subtracting(initialSelection)
            : capsHit.cappedSet
    }

    /// The server's own number while the selection is untouched; a local re-projection after edits.
    var projectedPoints: Int {
        selected == initialSelection
            ? serverProjectedPoints
            : Rulebook.projectedPoints(for: selected, capped: blockedCategories)
    }

    var capWarnings: [String] {
        Category.allCases
            .filter { selected.contains($0) && blockedCategories.contains($0) }
            .map { "Đã đủ \($0.label) \(Rulebook.capNoun(for: $0)) — mục này không cộng thêm điểm." }
    }

    func isCapped(_ category: Category) -> Bool {
        blockedCategories.contains(category)
    }

    func toggle(_ category: Category) {
        if selected.contains(category) {
            selected.remove(category)
        } else {
            selected.insert(category)
        }
    }

    func applyPlace(name: String?, source: PlaceSource) {
        placeName = name
        placeSource = name == nil ? PlaceSource.none : source
    }

    /// `PATCH /entries/:id` → status becomes `confirmed` and the categories become `source = user`.
    func confirm() async -> EntryDTO? {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let input = ConfirmEntryInput(
                categories: Category.allCases.filter { selected.contains($0) },
                placeName: placeName,
                placeSource: placeSource
            )
            let response = try await api.confirmEntry(id: entry.id, input)
            confirmedEntry = response.entry
            return response.entry
        } catch let error as APIError {
            errorMessage = error.userMessage
            return nil
        } catch {
            errorMessage = "Không lưu được, hãy thử lại."
            return nil
        }
    }
}
