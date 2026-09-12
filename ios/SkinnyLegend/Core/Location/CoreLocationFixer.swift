import CoreLocation
import Foundation

/// One "when in use" fix, ~100 m accuracy is fine (spec §8 step 2). The session is held only for
/// the duration of the request, and the whole thing gives up after 8 seconds so the Track flow
/// never stalls behind a denied or unavailable location.
struct CoreLocationFixer: LocationFixing {
    var timeout: Duration = .seconds(8)
    var acceptableAccuracy: CLLocationAccuracy = 150

    func currentFix() async -> GeoPoint? {
        await withTaskGroup(of: GeoPoint?.self) { group in
            group.addTask {
                let session = CLServiceSession(authorization: .whenInUse)
                defer { session.invalidate() }
                do {
                    for try await update in CLLocationUpdate.liveUpdates(.default) {
                        if update.authorizationDenied || update.authorizationDeniedGlobally
                            || update.authorizationRestricted || update.locationUnavailable {
                            return nil
                        }
                        if let location = update.location,
                           location.horizontalAccuracy >= 0,
                           location.horizontalAccuracy <= acceptableAccuracy {
                            return GeoPoint(location.coordinate)
                        }
                    }
                } catch {
                    return nil
                }
                return nil
            }
            group.addTask {
                try? await Task.sleep(for: timeout)
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}
