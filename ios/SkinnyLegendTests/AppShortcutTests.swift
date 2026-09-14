import Testing
@testable import SkinnyLegend

@Suite("AppShortcut")
struct AppShortcutTests {
    @Test("Every quick action type maps to its destination")
    func typesMapToRoutes() {
        #expect(AppShortcut.route(forType: "com.themarcus125.skinnylegend.track") == .tab(.track))
        #expect(AppShortcut.route(forType: "com.themarcus125.skinnylegend.leaderboard") == .tab(.leaderboard))
        #expect(AppShortcut.route(forType: "com.themarcus125.skinnylegend.trends") == .tab(.trends))
        #expect(AppShortcut.route(forType: "com.themarcus125.skinnylegend.map") == .map)
    }

    @Test("A type this build does not know routes nowhere")
    func unknownTypeIsIgnored() {
        #expect(AppShortcut.route(forType: "com.themarcus125.skinnylegend.retired") == nil)
        #expect(AppShortcut.route(forType: "") == nil)
    }

    @Test("Every declared shortcut has a route and a unique, prefixed type")
    func typesAreWellFormed() {
        let types = AppShortcut.allCases.map(\.rawValue)
        #expect(Set(types).count == types.count)
        #expect(types.allSatisfy { $0.hasPrefix("com.themarcus125.skinnylegend.") })
    }
}

@Suite("PushRouter quick actions")
@MainActor
struct PushRouterShortcutTests {
    @Test("A tab shortcut selects that tab and asks for no map")
    func tabShortcut() {
        let router = PushRouter()
        #expect(router.handle(shortcutType: "com.themarcus125.skinnylegend.leaderboard"))
        #expect(router.requestedTab == .leaderboard)
        #expect(router.isMapRequested == false)
    }

    @Test("The map shortcut selects Overview and raises the map flag")
    func mapShortcut() {
        let router = PushRouter()
        #expect(router.handle(shortcutType: "com.themarcus125.skinnylegend.map"))
        #expect(router.requestedTab == .dashboard)
        #expect(router.isMapRequested)
    }

    @Test("The map flag is consumed once")
    func mapFlagConsumesOnce() {
        let router = PushRouter()
        router.open(.map)
        #expect(router.consumeMap())
        #expect(router.isMapRequested == false)
        #expect(router.consumeMap() == false)
    }

    @Test("A tab shortcut after a map shortcut lowers the map flag again")
    func tabShortcutClearsPendingMap() {
        let router = PushRouter()
        router.open(.map)
        router.open(.tab(.track))
        #expect(router.requestedTab == .track)
        #expect(router.isMapRequested == false)
    }

    @Test("An unknown type leaves the router untouched and reports unhandled")
    func unknownShortcut() {
        let router = PushRouter()
        #expect(router.handle(shortcutType: "com.example.nope") == false)
        #expect(router.requestedTab == nil)
        #expect(router.isMapRequested == false)
    }
}
