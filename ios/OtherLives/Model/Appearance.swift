import SwiftUI
import CoreText

/// Page colours carried over from the web reader's themes.
enum PageTheme: String, CaseIterable, Identifiable {
    case stone, parchment, snow, moss
    var id: Self { self }

    var label: String { rawValue.capitalized }

    var paper: Color {
        switch self {
        case .stone: Color(hex: 0x373632)
        case .parchment: Color(hex: 0xE6D5B3)
        case .snow: Color(hex: 0xF4F5F2)
        case .moss: Color(hex: 0x30392C)
        }
    }

    var ink: Color {
        switch self {
        case .stone: Color(hex: 0xF3F0E7)
        case .parchment: Color(hex: 0x342B20)
        case .snow: Color(hex: 0x272D29)
        case .moss: Color(hex: 0xE2E6D5)
        }
    }

    var muted: Color {
        switch self {
        case .stone: Color(hex: 0xC1BCB1)
        case .parchment: Color(hex: 0x76644C)
        case .snow: Color(hex: 0x69716B)
        case .moss: Color(hex: 0xAEB9A1)
        }
    }

    var line: Color {
        switch self {
        case .stone: Color(hex: 0x625E54)
        case .parchment: Color(hex: 0xC7B38E)
        case .snow: Color(hex: 0xD9DFD7)
        case .moss: Color(hex: 0x59644D)
        }
    }

    var panel: Color {
        switch self {
        case .stone: Color(hex: 0x45423B)
        case .parchment: Color(hex: 0xDBC7A4)
        case .snow: Color(hex: 0xE9ECE7)
        case .moss: Color(hex: 0x3C4734)
        }
    }

    /// Ambient mesh tones: shadow, mid and light, as in the web reader's background.
    var ambient: (shadow: Color, mid: Color, light: Color) {
        switch self {
        case .stone: (Color(hex: 0x272722, opacity: 0.48), Color(hex: 0x4B4941, opacity: 0.22), Color(hex: 0x666258, opacity: 0.24))
        case .parchment: (Color(hex: 0x976F3F, opacity: 0.2), Color(hex: 0xC8A670, opacity: 0.18), Color(hex: 0xF4E9D2, opacity: 0.9))
        case .snow: (Color(hex: 0xA4AFAE, opacity: 0.13), Color(hex: 0xD3DBD9, opacity: 0.18), Color(hex: 0xFFFFFF, opacity: 0.96))
        case .moss: (Color(hex: 0x172316, opacity: 0.45), Color(hex: 0x586948, opacity: 0.3), Color(hex: 0x8DA176, opacity: 0.22))
        }
    }

    var colorScheme: ColorScheme {
        switch self {
        case .stone, .moss: .dark
        case .parchment, .snow: .light
        }
    }
}

/// Reading typefaces: the native iOS families plus Shinka and Shinka Mono from the web reader.
/// The interface always uses SF Pro (see `Font.interface`).
enum Typeface: String, CaseIterable, Identifiable {
    case newYork, sanFrancisco, rounded, mono, shinka, shinkaMono
    var id: Self { self }

    var label: String {
        switch self {
        case .newYork: "New York"
        case .sanFrancisco: "SF Pro"
        case .rounded: "SF Pro Rounded"
        case .mono: "SF Mono"
        case .shinka: "Shinka"
        case .shinkaMono: "Shinka Mono"
        }
    }

    var weights: [FontWeight] {
        switch self {
        case .shinkaMono: [.thin, .light, .regular, .medium, .bold]
        default: FontWeight.allCases
        }
    }

    /// The closest weight this family supplies, used when switching families.
    func closestWeight(to weight: FontWeight) -> FontWeight {
        weights.min { abs($0.value - weight.value) < abs($1.value - weight.value) } ?? .regular
    }

    func font(size: CGFloat, weight: FontWeight, italic: Bool = false) -> Font {
        let weight = closestWeight(to: weight)
        let design: Font.Design
        switch self {
        case .shinka, .shinkaMono:
            // Bundled faces are named like "Shinka-MediumItalic" and "ShinkaMono-Regular".
            let family = self == .shinka ? "Shinka" : "ShinkaMono"
            return .custom("\(family)-\(weight.name)\(italic ? "Italic" : "")", fixedSize: size)
        case .newYork: design = .serif
        case .sanFrancisco: design = .default
        case .rounded: design = .rounded
        case .mono: design = .monospaced
        }
        let font = Font.system(size: size, weight: weight.systemWeight, design: design)
        return italic ? font.italic() : font
    }

    /// Shinka ships in the app bundle; register it once at launch.
    static func registerBundledFonts() {
        let urls = Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? []
        CTFontManagerRegisterFontURLs(urls as CFArray, .process, true, nil)
    }
}

enum FontWeight: String, CaseIterable, Identifiable {
    case thin, light, regular, medium, bold, black
    var id: Self { self }
    var label: String { rawValue.capitalized }
    var name: String { rawValue.capitalized }

    var value: Int {
        switch self {
        case .thin: 100
        case .light: 300
        case .regular: 400
        case .medium: 500
        case .bold: 700
        case .black: 900
        }
    }

    var systemWeight: Font.Weight {
        switch self {
        case .thin: .thin
        case .light: .light
        case .regular: .regular
        case .medium: .medium
        case .bold: .bold
        case .black: .black
        }
    }
}

/// Reading preferences are stored per device with @AppStorage under these keys and defaults.
enum Preference {
    static let theme = "theme", typeface = "typeface", weight = "weight"
    static let textSize = "textSize", lineWidth = "lineWidth", paragraphNumbers = "paragraphNumbers"

    static let defaultTextSize = 19.0
    static let defaultLineWidth = 660.0
    static let textSizes = 14.0...30.0
    static let lineWidths = 480.0...860.0
}

/// The interface face: SF Pro. Reading text uses the chosen typeface instead.
extension Font {
    static func interface(_ size: CGFloat, weight: FontWeight = .regular) -> Font {
        Typeface.sanFrancisco.font(size: size, weight: weight)
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
