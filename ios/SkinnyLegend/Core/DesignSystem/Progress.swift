import SwiftUI

/// The progress-ring spec: a `track` circle with a rounded `primary` arc and a value in the
/// middle. Used for the weekly-cap goals on Trends.
struct ProgressRing<Center: View>: View {
    /// 0…1; values outside are clamped.
    let progress: Double
    var size: CGFloat = 72
    var lineWidth: CGFloat = 8
    var tint: Color = Theme.primary
    @ViewBuilder var center: Center

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0, min(1, progress)))
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            center
        }
        .frame(width: size, height: size)
        .animation(.smooth(duration: 0.4), value: progress)
    }
}

extension ProgressRing where Center == EmptyView {
    init(progress: Double, size: CGFloat = 72, lineWidth: CGFloat = 8, tint: Color = Theme.primary) {
        self.init(progress: progress, size: size, lineWidth: lineWidth, tint: tint) { EmptyView() }
    }
}

/// The bar-progress spec: a full-radius `track` rail with a `primary` fill.
struct ProgressBar: View {
    let progress: Double
    var height: CGFloat = 8
    var tint: Color = Theme.primary

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.track)
                Capsule()
                    .fill(tint)
                    .frame(width: geometry.size.width * max(0, min(1, progress)))
            }
        }
        .frame(height: height)
        .animation(.smooth(duration: 0.4), value: progress)
    }
}
