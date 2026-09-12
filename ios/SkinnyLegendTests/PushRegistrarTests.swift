import Foundation
import Testing
import UserNotifications
@testable import SkinnyLegend

@MainActor
private func makeRegistrar(
    status: UNAuthorizationStatus = .notDetermined,
    grant: Bool = true,
    token: String? = "fcm-token-1",
    api: MockAPIClient = MockAPIClient()
) -> (PushRegistrar, MockPushAuthorizer, MockAPIClient, UserDefaults) {
    let authorizer = MockPushAuthorizer(status: status, grant: grant)
    let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
    let registrar = PushRegistrar(
        api: api,
        authorizer: authorizer,
        tokens: MockPushTokenSource(token: token),
        defaults: defaults,
        locale: .vi
    )
    return (registrar, authorizer, api, defaults)
}

@Suite("PushRegistrar")
@MainActor
struct PushRegistrarTests {
    @Test("Maps every system authorization status")
    func mapsStatus() {
        #expect(PushRegistrar.permission(from: .notDetermined) == .notDetermined)
        #expect(PushRegistrar.permission(from: .authorized) == .authorized)
        #expect(PushRegistrar.permission(from: .provisional) == .authorized)
        #expect(PushRegistrar.permission(from: .ephemeral) == .authorized)
        #expect(PushRegistrar.permission(from: .denied) == .denied)
    }

    @Test("Enabling asks for permission, then registers the token with the API")
    func enableRegisters() async throws {
        let (registrar, authorizer, api, _) = makeRegistrar()
        let ok = await registrar.enable()
        #expect(ok)
        #expect(authorizer.requestCount == 1)
        #expect(authorizer.didRegisterForRemote)
        #expect(registrar.permission == .authorized)
        #expect(registrar.isEnabled)
        #expect(registrar.registeredToken == "fcm-token-1")
        #expect(await api.registeredTokens() == ["fcm-token-1"])
    }

    @Test("A denied prompt registers nothing and leaves the toggle off")
    func deniedDoesNotRegister() async {
        let (registrar, authorizer, api, _) = makeRegistrar(grant: false)
        let ok = await registrar.enable()
        #expect(!ok)
        #expect(registrar.permission == .denied)
        #expect(!registrar.isEnabled)
        #expect(!authorizer.didRegisterForRemote)
        #expect(await api.registeredTokens().isEmpty)
    }

    @Test("An already-authorized device registers without prompting again")
    func alreadyAuthorized() async {
        let (registrar, authorizer, api, _) = makeRegistrar(status: .authorized)
        #expect(await registrar.enable())
        #expect(authorizer.requestCount == 0)
        #expect(await api.registeredTokens() == ["fcm-token-1"])
    }

    @Test("A missing FCM token surfaces an error instead of registering an empty string")
    func missingToken() async {
        let (registrar, _, api, _) = makeRegistrar(token: nil)
        #expect(!(await registrar.enable()))
        #expect(registrar.errorMessage != nil)
        #expect(await api.registeredTokens().isEmpty)
    }

    @Test("Disabling unregisters the token and clears the flag")
    func disableUnregisters() async {
        let (registrar, _, api, defaults) = makeRegistrar()
        _ = await registrar.enable()
        await registrar.disable()
        #expect(!registrar.isEnabled)
        #expect(registrar.registeredToken == nil)
        #expect(await api.registeredTokens().isEmpty)
        #expect(!defaults.bool(forKey: PushRegistrar.enabledKey))
    }

    @Test("Refresh turns the toggle off when permission was revoked in Settings")
    func refreshRespectsRevocation() async {
        let (registrar, authorizer, _, _) = makeRegistrar(status: .authorized)
        _ = await registrar.enable()
        authorizer.status = .denied
        await registrar.refresh()
        #expect(registrar.permission == .denied)
        #expect(!registrar.isEnabled)
    }

    @Test("A refreshed token re-registers on a relaunch, before anything read the system setting")
    func tokenRefreshAfterRelaunch() async {
        let (registrar, authorizer, api, _) = makeRegistrar(status: .authorized)
        #expect(registrar.permission == .unknown)
        #expect(await registrar.registerCurrentToken())
        #expect(authorizer.requestCount == 0)
        #expect(await api.registeredTokens() == ["fcm-token-1"])
    }

    @Test("The post-first-entry prompt runs at most once per install")
    func asksOnlyOnce() async {
        let (registrar, authorizer, _, defaults) = makeRegistrar()
        await registrar.requestAfterFirstConfirmedEntry()
        #expect(authorizer.requestCount == 1)
        #expect(defaults.bool(forKey: PushRegistrar.didAskKey))

        await registrar.requestAfterFirstConfirmedEntry()
        #expect(authorizer.requestCount == 1)
    }

    @Test("A registrar built on defaults that already asked never prompts again")
    func respectsPersistedFlag() async {
        let api = MockAPIClient()
        let authorizer = MockPushAuthorizer(status: .notDetermined, grant: true)
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        defaults.set(true, forKey: PushRegistrar.didAskKey)
        let registrar = PushRegistrar(api: api, authorizer: authorizer,
                                      tokens: MockPushTokenSource(token: "t"), defaults: defaults, locale: .vi)
        await registrar.requestAfterFirstConfirmedEntry()
        #expect(authorizer.requestCount == 0)
    }
}
