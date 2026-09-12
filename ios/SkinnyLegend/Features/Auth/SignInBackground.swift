import AVFoundation
import SwiftUI
import UIKit

enum SignInBackgroundMode: Equatable { case video, gradient }

/// Video behind the sign-in screen (spec v1.1 §B), with a gradient fallback.
struct SignInBackground: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var failed = false

    nonisolated static let assetURL: URL? = Bundle.main.url(forResource: "signin-bg", withExtension: "mp4")

    nonisolated static func mode(reduceMotion: Bool, assetAvailable: Bool) -> SignInBackgroundMode {
        (reduceMotion || !assetAvailable) ? .gradient : .video
    }

    var body: some View {
        switch Self.mode(reduceMotion: reduceMotion, assetAvailable: Self.assetURL != nil && !failed) {
        case .gradient:
            WarmBackground()
        case .video:
            ZStack {
                LoopingVideoBackground(url: Self.assetURL!, isActive: scenePhase == .active, onFailure: { failed = true })
                LinearGradient(colors: [.black.opacity(0.15), .black.opacity(0.65)], startPoint: .top, endPoint: .bottom)
            }
            .ignoresSafeArea()
            .accessibilityHidden(true)
        }
    }
}

struct LoopingVideoBackground: UIViewRepresentable {
    let url: URL
    let isActive: Bool
    let onFailure: @MainActor @Sendable () -> Void

    func makeUIView(context: Context) -> PlayerView {
        let view = PlayerView()
        view.configure(url: url, onFailure: onFailure)
        return view
    }

    func updateUIView(_ view: PlayerView, context: Context) {
        isActive ? view.player.play() : view.player.pause()
    }

    final class PlayerView: UIView {
        override static var layerClass: AnyClass { AVPlayerLayer.self }
        private var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
        let player = AVQueuePlayer()
        private var looper: AVPlayerLooper?
        private var observation: NSKeyValueObservation?

        func configure(url: URL, onFailure: @escaping @MainActor @Sendable () -> Void) {
            let item = AVPlayerItem(url: url)
            looper = AVPlayerLooper(player: player, templateItem: item)
            player.isMuted = true
            player.preventsDisplaySleepDuringVideoPlayback = false
            playerLayer.player = player
            playerLayer.videoGravity = .resizeAspectFill
            observation = item.observe(\.status) { item, _ in
                if item.status == .failed { Task { @MainActor in onFailure() } }
            }
            player.play()
        }
    }
}
