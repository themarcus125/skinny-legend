import Foundation
import Observation
import UserNotifications

/// Owns notification permission and FCM token registration (spec §E). Permission is only ever
/// requested from `enable()` — the Account toggle — or `requestAfterFirstConfirmedEntry()`,
/// never at launch.
@MainActor
@Observable
final class PushRegistrar {
    enum Permission: Equatable {
        case unknown
        case notDetermined
        case authorized
        case denied
    }

    /// Set once the user has been asked after their first confirmed entry.
    static let didAskKey = "push.didAskAfterFirstConfirmedEntry"
    /// Mirrors the Account toggle, so a relaunch renders the right state before `refresh()` lands.
    static let enabledKey = "push.isEnabled"

    private let api: any APIClient
    private let authorizer: any PushAuthorizing
    private let tokens: any PushTokenSource
    private let defaults: UserDefaults
    /// A pinned locale (tests). `nil` reads the app's resolved language at every registration,
    /// so a language change in Account is what the next `POST /me/devices` carries.
    private let fixedLocale: DeviceLocale?

    private(set) var permission: Permission = .unknown
    private(set) var isEnabled: Bool
    private(set) var isBusy = false
    private(set) var errorMessage: String?
    private(set) var registeredToken: String?

    init(
        api: any APIClient,
        authorizer: any PushAuthorizing,
        tokens: any PushTokenSource,
        defaults: UserDefaults = .standard,
        locale: DeviceLocale? = nil
    ) {
        self.api = api
        self.authorizer = authorizer
        self.tokens = tokens
        self.defaults = defaults
        self.fixedLocale = locale
        self.isEnabled = defaults.bool(forKey: Self.enabledKey)
    }

    /// The locale sent with the token: the app's *resolved* language (spec §D), never the
    /// device language, because the server's push copy follows what the app is running in.
    private var locale: DeviceLocale { fixedLocale ?? .current }

    /// `.provisional` and `.ephemeral` deliver notifications, so they count as authorized.
    static func permission(from status: UNAuthorizationStatus) -> Permission {
        switch status {
        case .notDetermined: .notDetermined
        case .authorized, .provisional, .ephemeral: .authorized
        case .denied: .denied
        @unknown default: .denied
        }
    }

    /// Re-reads the system setting. Permission revoked in Settings turns the toggle off.
    func refresh() async {
        permission = Self.permission(from: await authorizer.authorizationStatus())
        if permission != .authorized, isEnabled { setEnabled(false) }
    }

    /// Account toggle ON. Prompts when undecided, then registers the token.
    @discardableResult
    func enable() async -> Bool {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        if permission == .unknown { await refresh() }
        if permission == .notDetermined {
            let granted = (try? await authorizer.requestAuthorization()) ?? false
            permission = granted ? .authorized : .denied
        }
        guard permission == .authorized else {
            setEnabled(false)
            return false
        }
        await authorizer.registerForRemoteNotifications()
        return await registerCurrentToken()
    }

    /// Sends the current FCM token to `POST /me/devices`. Also the hook for a refreshed token,
    /// which can arrive on a relaunch before anything else has read the system setting.
    @discardableResult
    func registerCurrentToken() async -> Bool {
        if permission == .unknown { await refresh() }
        guard permission == .authorized else { return false }
        guard let token = try? await tokens.currentToken(), !token.isEmpty else {
            errorMessage = Localized.string("Không lấy được mã thiết bị. Thử lại sau.")
            return false
        }
        do {
            try await api.registerDevice(token: token, platform: .ios, locale: locale)
            registeredToken = token
            setEnabled(true)
            return true
        } catch let error as APIError {
            errorMessage = error.userMessage
            return false
        } catch {
            errorMessage = Localized.string("Không bật được thông báo, hãy thử lại.")
            return false
        }
    }

    /// Account toggle OFF. Best effort: a failed DELETE still turns the toggle off locally,
    /// and the job drops the token the first time FCM reports it as unregistered.
    func disable() async {
        isBusy = true
        defer { isBusy = false }
        var token = registeredToken
        if token == nil { token = try? await tokens.currentToken() }
        if let token {
            try? await api.unregisterDevice(token: token)
        }
        registeredToken = nil
        setEnabled(false)
    }

    /// Spec §E: "Permission is requested after the user's first confirmed entry, never at
    /// launch." Runs at most once per install, whether or not the user says yes.
    func requestAfterFirstConfirmedEntry() async {
        guard !defaults.bool(forKey: Self.didAskKey) else { return }
        defaults.set(true, forKey: Self.didAskKey)
        await enable()
    }

    private func setEnabled(_ value: Bool) {
        isEnabled = value
        defaults.set(value, forKey: Self.enabledKey)
    }
}
