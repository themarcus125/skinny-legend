import Foundation
import Testing
import UserNotifications
@testable import SkinnyLegend

@MainActor
private func makeRegistrar(
    status: UNAuthorizationStatus = .notDetermined,
    grant: Bool = true,
    token: String? = "fcm-token-1",
    api: MockAPIClient = MockAPIClient(),
    signOutDeadline: Duration = PushRegistrar.defaultSignOutDeadline
) -> (PushRegistrar, MockPushAuthorizer, MockAPIClient, UserDefaults) {
    let authorizer = MockPushAuthorizer(status: status, grant: grant)
    let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
    let registrar = PushRegistrar(
        api: api,
        authorizer: authorizer,
        tokens: MockPushTokenSource(token: token),
        defaults: defaults,
        locale: .vi,
        signOutDeadline: signOutDeadline
    )
    return (registrar, authorizer, api, defaults)
}

/// Parks its first caller on a continuation until `open()` — the shape of Firebase's token
/// fetch while APNs is still negotiating — and answers every later caller straight away, so a
/// sign-out's own token lookup does not get stuck behind the registration under test.
@MainActor
private final class GatedTokenSource: PushTokenSource {
    private let token: String?
    private var parked: CheckedContinuation<Void, Never>?
    private var onPark: CheckedContinuation<Void, Never>?
    private var hasParked = false

    init(token: String?) { self.token = token }

    func currentToken() async throws -> String? {
        if !hasParked {
            hasParked = true
            await withCheckedContinuation { continuation in
                parked = continuation
                onPark?.resume()
                onPark = nil
            }
        }
        return token
    }

    /// Returns once the first caller is parked.
    func waitUntilParked() async {
        guard parked == nil else { return }
        await withCheckedContinuation { onPark = $0 }
    }

    func open() {
        parked?.resume()
        parked = nil
    }
}

/// Forwards to a `MockAPIClient` with one of two faults: `registerDevice` parks until `open()`
/// (so a test can put a `disable()` or sign-out in the window between the request leaving and
/// the row landing), or `unregisterDevice` never returns (an offline phone, or a Firebase
/// ID-token refresh that never comes back — what the sign-out deadline exists for).
@MainActor
private final class FaultyAPIClient: APIClient {
    enum Fault { case parkRegister, hangDelete }

    let inner = MockAPIClient()
    private let fault: Fault
    private var parked: [CheckedContinuation<Void, Never>] = []
    private var onPark: CheckedContinuation<Void, Never>?
    private(set) var registerCount = 0
    private(set) var deleteCount = 0

    init(_ fault: Fault) { self.fault = fault }

    func waitUntilParked() async {
        guard parked.isEmpty else { return }
        await withCheckedContinuation { onPark = $0 }
    }

    func open() {
        let waiting = parked
        parked = []
        waiting.forEach { $0.resume() }
    }

    func registerDevice(token: String, platform: DevicePlatform, locale: DeviceLocale) async throws {
        registerCount += 1
        if fault == .parkRegister {
            await withCheckedContinuation { continuation in
                parked.append(continuation)
                onPark?.resume()
                onPark = nil
            }
        }
        try await inner.registerDevice(token: token, platform: platform, locale: locale)
    }

    func unregisterDevice(token: String) async throws {
        deleteCount += 1
        if fault == .hangDelete {
            try? await Task.sleep(for: .seconds(3600))
            return
        }
        try await inner.unregisterDevice(token: token)
    }

    func session() async throws -> UserDTO { try await inner.session() }
    func me() async throws -> UserDTO { try await inner.me() }
    func updateMe(displayName: String?, avatarKey: String?, locale: UserDTO.Locale?) async throws -> UserDTO {
        try await inner.updateMe(displayName: displayName, avatarKey: avatarKey, locale: locale)
    }
    func presign(kind: UploadKind, contentType: String) async throws -> PresignDTO { try await inner.presign(kind: kind, contentType: contentType) }
    func upload(_ data: Data, to presign: PresignDTO, contentType: String, onProgress: @escaping @Sendable (Double) -> Void) async throws {
        try await inner.upload(data, to: presign, contentType: contentType, onProgress: onProgress)
    }
    func createEntry(_ input: CreateEntryInput) async throws -> CreateEntryResponse { try await inner.createEntry(input) }
    func confirmEntry(id: String, _ input: ConfirmEntryInput) async throws -> ConfirmEntryResponse { try await inner.confirmEntry(id: id, input) }
    func deleteEntry(id: String) async throws { try await inner.deleteEntry(id: id) }
    func myEntries(cursor: String?) async throws -> HistoryPage { try await inner.myEntries(cursor: cursor) }
    func dashboard() async throws -> DashboardDTO { try await inner.dashboard() }
    func leaderboard() async throws -> [LeaderboardRow] { try await inner.leaderboard() }
    func trends() async throws -> TrendsDTO { try await inner.trends() }
    func feed(cursor: String?) async throws -> FeedPage { try await inner.feed(cursor: cursor) }
    func entries(ofUser userID: String, cursor: String?) async throws -> EntryPage { try await inner.entries(ofUser: userID, cursor: cursor) }
    func sendFeedback(message: String, screenshotKey: String?, appVersion: String) async throws {
        try await inner.sendFeedback(message: message, screenshotKey: screenshotKey, appVersion: appVersion)
    }
    func mapPins(days: Int) async throws -> MapPinsPage { try await inner.mapPins(days: days) }
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

        await registrar.requestAfterFirstConfirmedEntry(userID: "u1")
        #expect(defaults.bool(forKey: PushRegistrar.didAskKey(for: "u1")))
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

    @Test("Sign-out deletes the token and clears every install-scoped flag, keeping the per-user asked flag")
    func resetForSignOut() async {
        let (registrar, _, api, defaults) = makeRegistrar()
        await registrar.requestAfterFirstConfirmedEntry(userID: "u1")
        #expect(await api.registeredTokens() == ["fcm-token-1"])

        await registrar.resetForSignOut()

        #expect(await api.registeredTokens().isEmpty)
        #expect(!registrar.isEnabled)
        #expect(!registrar.isRegistrationPending)
        #expect(!registrar.isBusy)
        #expect(registrar.registeredToken == nil)
        #expect(defaults.bool(forKey: PushRegistrar.didAskKey(for: "u1")))
        #expect(!defaults.bool(forKey: PushRegistrar.enabledKey))
        #expect(!defaults.bool(forKey: PushRegistrar.pendingKey))
    }

    @Test("Sign-out clears local state before its DELETE, so a registration parked on the token fetch cannot resurrect it")
    func signOutDuringTokenFetchDoesNotResurrectRegistration() async {
        let api = MockAPIClient()
        let tokens = GatedTokenSource(token: "fcm-token-1")
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        let registrar = PushRegistrar(api: api, authorizer: MockPushAuthorizer(), tokens: tokens, defaults: defaults, locale: .vi)

        let enabling = Task { await registrar.enable() }
        await tokens.waitUntilParked()
        #expect(registrar.isEnabled) // intent recorded, token still outstanding

        await registrar.resetForSignOut()
        #expect(!registrar.isEnabled)
        #expect(!registrar.isRegistrationPending)
        #expect(!defaults.bool(forKey: PushRegistrar.enabledKey))

        tokens.open()
        #expect(!(await enabling.value))

        #expect(!registrar.isEnabled)
        #expect(!registrar.isRegistrationPending)
        #expect(!registrar.isBusy)
        #expect(registrar.registeredToken == nil)
        #expect(registrar.errorMessage == nil)
        #expect(await api.registeredTokens().isEmpty)
        #expect(!defaults.bool(forKey: PushRegistrar.enabledKey))
        #expect(!defaults.bool(forKey: PushRegistrar.pendingKey))
    }

    @Test("A POST that lands after sign-out is taken back down and writes no state")
    func signOutDuringRegisterDeviceTakesTheRowBackDown() async {
        let api = FaultyAPIClient(.parkRegister)
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        let registrar = PushRegistrar(api: api, authorizer: MockPushAuthorizer(),
                                      tokens: MockPushTokenSource(token: "fcm-token-1"), defaults: defaults, locale: .vi)

        let enabling = Task { await registrar.enable() }
        await api.waitUntilParked()

        await registrar.resetForSignOut()
        api.open()
        #expect(!(await enabling.value))

        #expect(!registrar.isEnabled)
        #expect(!registrar.isRegistrationPending)
        #expect(registrar.registeredToken == nil)
        #expect(api.registerCount == 1) // no re-POST
        #expect(await api.inner.registeredTokens().isEmpty)
    }

    @Test("Turning reminders off while the POST is in flight wins over the POST")
    func disableDuringRegisterDeviceWins() async {
        let api = FaultyAPIClient(.parkRegister)
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        let registrar = PushRegistrar(api: api, authorizer: MockPushAuthorizer(),
                                      tokens: MockPushTokenSource(token: "fcm-token-1"), defaults: defaults, locale: .vi)

        let enabling = Task { await registrar.enable() }
        await api.waitUntilParked()
        await registrar.disable()
        api.open()
        #expect(!(await enabling.value))

        #expect(!registrar.isEnabled)
        #expect(!registrar.isBusy)
        #expect(registrar.registeredToken == nil)
        #expect(await api.inner.registeredTokens().isEmpty)

        // A rotated token afterwards still respects the OFF.
        await registrar.handleTokenRefresh()
        #expect(api.registerCount == 1)
    }

    @Test("A token callback that resumes after sign-out registers nothing")
    func tokenCallbackAfterSignOutIsDropped() async {
        let api = MockAPIClient()
        let tokens = GatedTokenSource(token: "fcm-token-late")
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        defaults.set(true, forKey: PushRegistrar.pendingKey)
        defaults.set(true, forKey: PushRegistrar.enabledKey)
        let authorizer = MockPushAuthorizer(status: .authorized)
        let registrar = PushRegistrar(api: api, authorizer: authorizer, tokens: tokens, defaults: defaults, locale: .vi)
        #expect(registrar.isRegistrationPending)

        let refreshing = Task { await registrar.handleTokenRefresh() }
        await tokens.waitUntilParked()
        await registrar.resetForSignOut()
        tokens.open()
        await refreshing.value

        #expect(!registrar.isEnabled)
        #expect(!registrar.isRegistrationPending)
        #expect(registrar.registeredToken == nil)
        #expect(await api.registeredTokens().isEmpty)
    }

    @Test("Sign-out gives up on a DELETE that never returns once the deadline passes")
    func signOutIsBoundedByTheDeadline() async {
        let api = FaultyAPIClient(.hangDelete)
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        let registrar = PushRegistrar(api: api, authorizer: MockPushAuthorizer(),
                                      tokens: MockPushTokenSource(token: "fcm-token-1"), defaults: defaults, locale: .vi,
                                      signOutDeadline: .milliseconds(20))
        #expect(await registrar.enable())

        let clock = ContinuousClock()
        let elapsed = await clock.measure { await registrar.resetForSignOut() }

        #expect(elapsed < .seconds(2))
        #expect(api.deleteCount == 1)
        #expect(!registrar.isEnabled)
        #expect(!registrar.isRegistrationPending)
        #expect(!registrar.isBusy)
        #expect(registrar.registeredToken == nil)
        #expect(!defaults.bool(forKey: PushRegistrar.enabledKey))
    }

    @Test("A sign-out with nothing registered sends no DELETE at all")
    func signOutWithoutRegistrationSkipsTheDelete() async {
        let api = FaultyAPIClient(.hangDelete)
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        let registrar = PushRegistrar(api: api, authorizer: MockPushAuthorizer(),
                                      tokens: MockPushTokenSource(token: "fcm-token-1"), defaults: defaults, locale: .vi)
        await registrar.resetForSignOut()
        #expect(api.deleteCount == 0)
    }

    @Test("Clearing local state forgets the registration without touching the server")
    func clearLocalStateIsSynchronousAndLocal() async {
        let (registrar, _, api, defaults) = makeRegistrar()
        #expect(await registrar.enable())

        registrar.clearLocalState()

        #expect(!registrar.isEnabled)
        #expect(!registrar.isRegistrationPending)
        #expect(registrar.registeredToken == nil)
        #expect(!defaults.bool(forKey: PushRegistrar.enabledKey))
        #expect(!defaults.bool(forKey: PushRegistrar.pendingKey))
        #expect(await api.registeredTokens() == ["fcm-token-1"]) // the row is the server's to drop

        // And it invalidates whatever was in flight: a later callback must not re-register.
        await registrar.handleTokenRefresh()
        #expect(!registrar.isEnabled)
    }

    @Test("The asked flag is per user: a returning member who turned reminders off stays off, a new account is asked")
    func askedFlagIsScopedPerUser() async {
        let (registrar, authorizer, api, defaults) = makeRegistrar()
        await registrar.requestAfterFirstConfirmedEntry(userID: "u1")
        #expect(authorizer.requestCount == 1)
        await registrar.disable() // an explicit OFF
        await registrar.resetForSignOut()
        #expect(defaults.bool(forKey: PushRegistrar.didAskKey(for: "u1")))

        // u1 signs back in and confirms another entry: not re-enabled.
        await registrar.requestAfterFirstConfirmedEntry(userID: "u1")
        #expect(!registrar.isEnabled)
        #expect(await api.registeredTokens().isEmpty)

        // A different account on the same phone is asked afresh.
        await registrar.requestAfterFirstConfirmedEntry(userID: "u2")
        #expect(defaults.bool(forKey: PushRegistrar.didAskKey(for: "u2")))
        #expect(registrar.isEnabled)
        #expect(await api.registeredTokens() == ["fcm-token-1"])
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
        await registrar.requestAfterFirstConfirmedEntry(userID: "u1")
        #expect(authorizer.requestCount == 1)
        #expect(defaults.bool(forKey: PushRegistrar.didAskKey(for: "u1")))

        await registrar.requestAfterFirstConfirmedEntry(userID: "u1")
        #expect(authorizer.requestCount == 1)
    }

    @Test("A registrar built on defaults that already asked never prompts again")
    func respectsPersistedFlag() async {
        let api = MockAPIClient()
        let authorizer = MockPushAuthorizer(status: .notDetermined, grant: true)
        let defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        defaults.set(true, forKey: PushRegistrar.didAskKey(for: "u1"))
        let registrar = PushRegistrar(api: api, authorizer: authorizer,
                                      tokens: MockPushTokenSource(token: "t"), defaults: defaults, locale: .vi)
        await registrar.requestAfterFirstConfirmedEntry(userID: "u1")
        #expect(authorizer.requestCount == 0)
    }

    @Test("A member who already turned notifications off is not re-prompted by a later entry")
    func doesNotReprompt() async {
        let (registrar, authorizer, api, _) = makeRegistrar(grant: false)
        await registrar.requestAfterFirstConfirmedEntry(userID: "u1")
        #expect(authorizer.requestCount == 1)
        #expect(!registrar.isEnabled)

        // A second confirmed entry must not nag.
        await registrar.requestAfterFirstConfirmedEntry(userID: "u1")
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
