import SwiftUI
import CoreText

/// Neutral page colours shared by the scrolling and paged readers.
enum PageTheme: String, CaseIterable, Identifiable {
    case light, dark
    var id: Self { self }

    var label: String { rawValue.capitalized }
    var paper: Color { self == .light ? .white : .black }
    var ink: Color { self == .light ? .black : .white }
    var muted: Color { Color(white: self == .light ? 0.4 : 0.65) }
    var line: Color { Color(white: self == .light ? 0.85 : 0.25) }
    var panel: Color { Color(white: self == .light ? 0.95 : 0.1) }
    var colorScheme: ColorScheme { self == .light ? .light : .dark }

    /// Keep the brightness preference when replacing the original coloured themes.
    static func migrateSavedTheme(in defaults: UserDefaults = .standard) {
        switch defaults.string(forKey: Preference.theme) {
        case "stone", "moss": defaults.set(PageTheme.dark.rawValue, forKey: Preference.theme)
        case "parchment", "snow": defaults.set(PageTheme.light.rawValue, forKey: Preference.theme)
        default: break
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

    /// The same face for TextKit, which lays out the paged reader.
    func uiFont(size: CGFloat, weight: FontWeight) -> UIFont {
        let weight = closestWeight(to: weight)
        let design: UIFontDescriptor.SystemDesign
        switch self {
        case .shinka, .shinkaMono:
            let family = self == .shinka ? "Shinka" : "ShinkaMono"
            return UIFont(name: "\(family)-\(weight.name)", size: size) ?? .systemFont(ofSize: size)
        case .newYork: design = .serif
        case .sanFrancisco: design = .default
        case .rounded: design = .rounded
        case .mono: design = .monospaced
        }
        let font = UIFont.systemFont(ofSize: size, weight: weight.uiWeight)
        return font.fontDescriptor.withDesign(design).map { UIFont(descriptor: $0, size: size) } ?? font
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

    var uiWeight: UIFont.Weight {
        switch self {
        case .thin: .thin
        case .light: .light
        case .regular: .regular
        case .medium: .medium
        case .bold: .bold
        case .black: .black
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
    static let readingLayout = "readingLayout", pageColumns = "pageColumns"

    static let defaultTextSize = 19.0
    static let defaultLineWidth = 660.0
    static let textSizes = 14.0...30.0
    static let lineWidths = 480.0...860.0
}

/// How an article is laid out: one continuous scroll, or pages of one or two columns.
enum ReadingLayout: String, CaseIterable, Identifiable {
    case scroll, pages
    var id: Self { self }
    var label: String { rawValue.capitalized }
    var systemImage: String { self == .scroll ? "scroll" : "book.pages" }
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
