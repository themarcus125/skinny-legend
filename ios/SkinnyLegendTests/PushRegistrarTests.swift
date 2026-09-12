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

/// Hands out one answer per call, so a test can play "no token yet, then a token" the way
/// Firebase does before and after the APNs token lands.
@MainActor
private final class SequencedTokenSource: PushTokenSource {
    private var tokens: [String?]
    init(tokens: [String?]) { self.tokens = tokens }
    func currentToken() async throws -> String? {
        tokens.count > 1 ? tokens.removeFirst() : tokens.first ?? nil
    }
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

    @Test("A token that is not available yet leaves the registration pending, with the toggle on and no error")
    func missingTokenIsPending() async {
        let (registrar, _, api, defaults) = makeRegistrar(token: nil)
        #expect(!(await registrar.enable()))
        #expect(registrar.isEnabled)
        #expect(registrar.isRegistrationPending)
        #expect(registrar.errorMessage == nil)
        #expect(await api.registeredTokens().isEmpty)
        #expect(defaults.bool(forKey: PushRegistrar.pendingKey))
    }

    @Test("The FCM token callback completes a registration that was waiting on APNs")
    func tokenCallbackCompletesPendingRegistration() async {
        let api = MockAPIClient()
        let authorizer = MockPushAuthorizer()
        let tokens = SequencedTokenSource(tokens: [nil, "fcm-token-late"])
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        let registrar = PushRegistrar(api: api, authorizer: authorizer, tokens: tokens, defaults: defaults, locale: .vi)

        #expect(!(await registrar.enable()))
        #expect(registrar.isRegistrationPending)
        #expect(authorizer.didRegisterForRemote)

        await registrar.handleTokenRefresh()

        #expect(registrar.isEnabled)
        #expect(!registrar.isRegistrationPending)
        #expect(registrar.registeredToken == "fcm-token-late")
        #expect(registrar.errorMessage == nil)
        #expect(await api.registeredTokens() == ["fcm-token-late"])
        #expect(!defaults.bool(forKey: PushRegistrar.pendingKey))
    }

    @Test("The once-per-install prompt still registers when the token arrives later")
    func firstEntryPromptSurvivesLateToken() async {
        let api = MockAPIClient()
        let tokens = SequencedTokenSource(tokens: [nil, "fcm-token-late"])
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        let registrar = PushRegistrar(api: api, authorizer: MockPushAuthorizer(), tokens: tokens, defaults: defaults, locale: .vi)

        await registrar.requestAfterFirstConfirmedEntry()
        #expect(defaults.bool(forKey: PushRegistrar.didAskKey))
        #expect(registrar.isRegistrationPending)

        await registrar.handleTokenRefresh()
        #expect(await api.registeredTokens() == ["fcm-token-late"])
    }

    @Test("A rotated token never re-registers a device whose reminders are off")
    func tokenCallbackRespectsDisable() async {
        let (registrar, _, api, _) = makeRegistrar()
        _ = await registrar.enable()
        await registrar.disable()
        await registrar.handleTokenRefresh()
        #expect(!registrar.isEnabled)
        #expect(await api.registeredTokens().isEmpty)
    }

    @Test("Sign-out deletes the token and clears every install-scoped flag")
    func resetForSignOut() async {
        let (registrar, _, api, defaults) = makeRegistrar()
        await registrar.requestAfterFirstConfirmedEntry()
        #expect(await api.registeredTokens() == ["fcm-token-1"])

        await registrar.resetForSignOut()

        #expect(await api.registeredTokens().isEmpty)
        #expect(!registrar.isEnabled)
        #expect(!registrar.isRegistrationPending)
        #expect(registrar.registeredToken == nil)
        #expect(!defaults.bool(forKey: PushRegistrar.didAskKey))
        #expect(!defaults.bool(forKey: PushRegistrar.enabledKey))
        #expect(!defaults.bool(forKey: PushRegistrar.pendingKey))
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

    @Test("A member who already turned notifications off is not re-prompted by a later entry")
    func doesNotReprompt() async {
        let (registrar, authorizer, api, _) = makeRegistrar(grant: false)
        await registrar.requestAfterFirstConfirmedEntry()
        #expect(authorizer.requestCount == 1)
        #expect(!registrar.isEnabled)

        // A second confirmed entry must not nag.
        await registrar.requestAfterFirstConfirmedEntry()
        #expect(authorizer.requestCount == 1)
        #expect(await api.registeredTokens().isEmpty)
    }

    @Test("Re-enabling after a denial does not register, so the Account row can explain why")
    func reEnableAfterDenial() async {
        let (registrar, _, api, _) = makeRegistrar(status: .denied)
        #expect(!(await registrar.enable()))
        #expect(registrar.permission == .denied)
        #expect(await api.registeredTokens().isEmpty)
    }
}
