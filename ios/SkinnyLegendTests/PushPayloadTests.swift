import Testing
@testable import SkinnyLegend

@Suite("PushPayload")
struct PushPayloadTests {
    @Test("A track deep link resolves to the Track tab")
    func trackDeepLink() {
        #expect(PushPayload.tab(from: ["deepLink": "track", "kind": "inactive_1d"]) == .track)
    }

    @Test("An unknown or missing deep link resolves to nothing")
    func unknownDeepLink() {
        #expect(PushPayload.tab(from: ["deepLink": "leaderboard"]) == nil)
        #expect(PushPayload.tab(from: ["kind": "rank_nudge"]) == nil)
        #expect(PushPayload.tab(from: [:]) == nil)
        #expect(PushPayload.tab(from: ["deepLink": 7]) == nil)
    }
}
