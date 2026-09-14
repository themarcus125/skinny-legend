// Renders the app icon: the flame glyph in Vanilla on Eerie Black, 1024×1024, no alpha.
//
//   swift ios/Scripts/GenerateAppIcon.swift ios/SkinnyLegend/Assets.xcassets/AppIcon.appiconset/AppIcon.png
//
// Colours are the design system's `--vanilla` (#EFF0A3) and `--eerie` (#212121); the icon keeps
// the light-mode ink ground in both appearances, as iOS icons do not follow the system theme.
import AppKit
import SwiftUI

let side: CGFloat = 1024
let vanilla = Color(red: 0xEF / 255, green: 0xF0 / 255, blue: 0xA3 / 255)
let eerie = Color(red: 0x21 / 255, green: 0x21 / 255, blue: 0x21 / 255)

struct Base: View {
    var body: some View {
        ZStack {
            Rectangle().fill(eerie)
            Image(systemName: "flame.fill")
                .font(.system(size: side * 0.56, weight: .bold))
                .foregroundStyle(vanilla)
        }
        .frame(width: side, height: side)
    }
}

let output = CommandLine.arguments.count > 1
    ? URL(fileURLWithPath: CommandLine.arguments[1])
    : URL(fileURLWithPath: "AppIcon.png")

MainActor.assumeIsolated {
    let renderer = ImageRenderer(content: Base())
    renderer.scale = 1
    renderer.isOpaque = true
    guard let cgImage = renderer.cgImage else {
        FileHandle.standardError.write(Data("failed to render\n".utf8))
        exit(1)
    }
    // An App Store icon may carry no alpha channel at all, so the render is redrawn into an
    // opaque RGB bitmap rather than saved straight from the renderer.
    guard let context = CGContext(
        data: nil,
        width: Int(side), height: Int(side),
        bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else { exit(1) }
    context.setFillColor(NSColor(eerie).cgColor)
    context.fill(CGRect(x: 0, y: 0, width: side, height: side))
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))
    guard let flattened = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(output as CFURL, "public.png" as CFString, 1, nil)
    else { exit(1) }
    CGImageDestinationAddImage(destination, flattened, nil)
    guard CGImageDestinationFinalize(destination) else { exit(1) }
    print("wrote \(output.path)")
}
