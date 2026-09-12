import SwiftUI
import MapKit
import CoreLocation

/// Spec §7/§8: a group map of recent entry locations, one avatar pin per place (or cluster of
/// places within 50 m), so the group can see where everyone has been without exposing raw
/// coordinates anywhere but here.
struct MapScreen: View {
    @State private var model: MapModel
    @State private var camera: MapCameraPosition = .automatic
    @State private var selectedCluster: MapCluster?
    @State private var hasFittedCamera = false

    init(api: any APIClient) {
        _model = State(initialValue: MapModel(api: api))
    }

    var body: some View {
        ZStack {
            WarmBackground()
            switch model.state {
            case .idle, .loading:
                ProgressView()
            case .failed(let message):
                ContentUnavailableView {
                    Label("Không tải được", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Thử lại") { Task { await model.load() } }
                        .buttonStyle(.glassProminent)
                }
            case .loaded(let clusters) where clusters.isEmpty:
                ContentUnavailableView("Chưa có địa điểm nào được chia sẻ.", systemImage: "map")
            case .loaded(let clusters):
                mapView(clusters)
            }
        }
        .navigationTitle("Bản đồ")
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    private func mapView(_ clusters: [MapCluster]) -> some View {
        Map(position: $camera) {
            ForEach(clusters) { cluster in
                Annotation("", coordinate: cluster.center.coordinate) {
                    ClusterPin(cluster: cluster)
                        .onTapGesture { selectedCluster = cluster }
                }
            }
        }
        .mapControls {
            MapCompass()
            MapScaleView()
        }
        .onAppear { fitCameraIfNeeded(clusters) }
        .sheet(item: $selectedCluster) { cluster in
            if cluster.pins.count == 1, let pin = cluster.pins.first {
                MapPinCard(pin: pin)
            } else {
                MapPinListSheet(cluster: cluster)
            }
        }
    }

    /// Fits the camera to every cluster center on the first successful load only, with 20% padding,
    /// so a manual pan/zoom afterwards (or a pull-to-refresh) never yanks the map back.
    private func fitCameraIfNeeded(_ clusters: [MapCluster]) {
        guard !hasFittedCamera, !clusters.isEmpty else { return }
        hasFittedCamera = true
        let lats = clusters.map(\.center.lat)
        let lngs = clusters.map(\.center.lng)
        guard let minLat = lats.min(), let maxLat = lats.max(),
              let minLng = lngs.min(), let maxLng = lngs.max() else { return }
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2)
        let span = MKCoordinateSpan(
            latitudeDelta: max((maxLat - minLat) * 1.2, 0.01),
            longitudeDelta: max((maxLng - minLng) * 1.2, 0.01)
        )
        camera = .region(MKCoordinateRegion(center: center, span: span))
    }
}

/// One map annotation: the newest pin's avatar in a glass ring, plus a flame-tinted count badge
/// when several entries clustered together.
private struct ClusterPin: View {
    let cluster: MapCluster

    var body: some View {
        ZStack(alignment: .topTrailing) {
            AvatarView(url: cluster.pins[0].user.avatarUrl, displayName: cluster.pins[0].user.displayName, size: 36)
                .padding(4)
                .glassEffect(.regular.interactive(), in: Circle())

            if cluster.pins.count > 1 {
                Text("\(cluster.pins.count)")
                    .font(.roundedLabel(11, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.flame, in: Capsule())
                    .overlay(Capsule().stroke(.white, lineWidth: 1.5))
                    .offset(x: 8, y: -6)
            }
        }
    }
}

/// A multi-pin cluster's detail: compact rows that each open the full `MapPinCard`.
private struct MapPinListSheet: View {
    let cluster: MapCluster
    @State private var selectedPin: MapPinDTO?

    var body: some View {
        NavigationStack {
            List(cluster.pins) { pin in
                Button {
                    selectedPin = pin
                } label: {
                    row(pin)
                }
                .buttonStyle(.plain)
            }
            .navigationTitle("Địa điểm")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sheet(item: $selectedPin) { pin in
            MapPinCard(pin: pin)
        }
    }

    private func row(_ pin: MapPinDTO) -> some View {
        HStack(spacing: 12) {
            AvatarView(url: pin.user.avatarUrl, displayName: pin.user.displayName, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(pin.user.displayName)
                    .font(.roundedLabel(15, weight: .bold))
                Text(LocalDay.display(pin.localDate))
                    .font(.roundedLabel(12, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.secondary)
        }
        .contentShape(Rectangle())
    }
}
