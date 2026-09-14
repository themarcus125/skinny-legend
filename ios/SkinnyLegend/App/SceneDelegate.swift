import UIKit

/// Home Screen quick actions are delivered to the *scene*, not the application, in a
/// scene-based app. `SkinnyLegendApp`'s `WindowGroup` keeps owning the window — this delegate
/// deliberately creates none — and only forwards the two callbacks a quick action arrives on
/// to `PushRouter`:
///
/// * cold launch (the app was not running): `connectionOptions.shortcutItem`
/// * warm launch (already running or suspended): `windowScene(_:performActionFor:)`
@MainActor
final class SceneDelegate: NSObject, UIWindowSceneDelegate {
    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let shortcut = connectionOptions.shortcutItem else { return }
        PushRouter.shared.handle(shortcutType: shortcut.type)
    }

    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        // `false` tells UIKit the action was not handled — an unknown type, which the Home
        // Screen can still hold on to after the shortcut has been removed from the plist.
        completionHandler(PushRouter.shared.handle(shortcutType: shortcutItem.type))
    }
}
