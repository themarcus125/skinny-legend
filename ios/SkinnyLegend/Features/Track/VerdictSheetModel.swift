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
    /// Mutable so a successful `.edit`-mode `confirm()` can replace the constructor's placeholder
    /// caps/projection with the server's real, post-save numbers (ruling 2).
    private var initialSelection: Set<Category>
    private var serverProjectedPoints: Int
    private var capsHit: CapsHit
    private var cappedCategories: Set<Category>
    /// `.edit` mode opens on a historical entry with no fresh server projection — the caller's
    /// `capsHit`/`cappedCategories` are placeholders, not real data (ruling 2), so they are
    /// ignored until a successful `confirm()` replaces them with the PATCH response's real ones.
    /// Exposed read-only so `VerdictSheet` can hide the pre-save projection card (ruling 2 gap).
    private(set) var hasConfirmedProjection = false

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
        cappedCategories: [Category],
        projectedPoints: Int,
        placeName: String?,
        placeSource: PlaceSource
    ) {
        self.api = api
        self.id = entry.id
        self.entry = entry
        self.mode = mode
        self.capsHit = capsHit
        self.cappedCategories = Set(cappedCategories)
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

    /// Categories that cannot earn points for this entry. While the selection is untouched, this
    /// is exactly the server's own `cappedCategories` for this entry — no inference needed, since
    /// the server already told us which of this entry's own categories scored 0. Once the user
    /// edits the selection, a category not in `cappedCategories` may still need to be treated as
    /// blocked when re-projecting locally: a category `capsHit` reports as full for the entry's
    /// period, but that isn't one of the initial (server-scored) categories, was filled by another
    /// entry and stays blocked if added back.
    ///
    /// A history edit (`.edit`) has no fresh server projection until it is saved once, so nothing
    /// is claimed as capped before that (ruling 2) — a locally re-projected point total while
    /// editing is a plain, un-capped estimate, replaced by the real numbers once `confirm()`
    /// succeeds.
    private var blockedCategories: Set<Category> {
        if case .edit = mode, !hasConfirmedProjection { return [] }
        guard selected != initialSelection else { return cappedCategories }
        let filledByOtherEntries = Category.allCases.filter { capsHit[$0] && !initialSelection.contains($0) }
        return cappedCategories.union(filledByOtherEntries)
    }

    /// The server's own number while the selection is untouched; a local re-projection after edits.
    var projectedPoints: Int {
        selected == initialSelection
            ? serverProjectedPoints
            : Rulebook.projectedPoints(for: selected, capped: blockedCategories)
    }

    /// Catalog key `Đã đủ %@ %@ — mục này không cộng thêm điểm.` — argument 1 is the category
    /// label, argument 2 the period noun; the English value reorders them positionally.
    var capWarnings: [String] {
        Category.allCases
            .filter { selected.contains($0) && blockedCategories.contains($0) }
            .map { Localized.string("Đã đủ \($0.label) \(Rulebook.capNoun(for: $0)) — mục này không cộng thêm điểm.") }
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
            if case .edit = mode {
                // The PATCH response is the first real projection this history edit has ever had
                // (ruling 2) — adopt it as the new baseline so `projectedPoints`/`capWarnings`
                // immediately reflect it instead of the placeholder caps passed at init.
                capsHit = response.capsHit
                cappedCategories = Set(response.cappedCategories)
                serverProjectedPoints = response.projectedPoints
                initialSelection = selected
                hasConfirmedProjection = true
            }
            return response.entry
        } catch let error as APIError {
            errorMessage = error.userMessage
            return nil
        } catch {
            errorMessage = Localized.string("Không lưu được, hãy thử lại.")
            return nil
        }
    }
}
