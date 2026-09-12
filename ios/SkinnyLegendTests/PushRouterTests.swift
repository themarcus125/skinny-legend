import Testing
@testable import SkinnyLegend

@Suite("PushRouter")
@MainActor
struct PushRouterTests {
    @Test("A tapped reminder requests the Track tab")
    func requestsTrack() {
        let router = PushRouter()
        router.handle(userInfo: ["deepLink": "track"])
        #expect(router.requestedTab == .track)
    }

    @Test("A payload with no deep link leaves the router untouched")
    func ignoresUnknown() {
        let router = PushRouter()
        router.handle(userInfo: ["deepLink": "nope"])
        #expect(router.requestedTab == nil)
    }

    @Test("Consuming the request clears it so a later tab change is not undone")
    func consumesOnce() {
        let router = PushRouter()
        router.request(.track)
        #expect(router.consume() == .track)
        #expect(router.requestedTab == nil)
        #expect(router.consume() == nil)
    }
}
