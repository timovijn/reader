import SwiftUI
import UIKit

/// The article laid out on pages of one or two columns. Swipe, tap the outer
/// edges, or use the arrow keys to turn pages.
struct PagedReaderView: View {
    let article: Article
    @AppStorage(Preference.theme) private var theme: PageTheme = .light
    @AppStorage(Preference.typeface) private var typeface: Typeface = .newYork
    @AppStorage(Preference.weight) private var weight: FontWeight = .regular
    @AppStorage(Preference.textSize) private var textSize = Preference.defaultTextSize
    @AppStorage(Preference.lineWidth) private var lineWidth = Preference.defaultLineWidth
    @AppStorage(Preference.pageColumns) private var columns = 2
    @State private var pagination: Pagination?
    @State private var page = 0
    /// The first character on the current page, kept when pages are laid out again.
    @State private var anchor = 0
    @FocusState private var isFocused: Bool

    var body: some View {
        GeometryReader { proxy in
            let key = LayoutKey(
                size: proxy.size, columns: columns, typeface: typeface, weight: weight,
                textSize: textSize, lineWidth: lineWidth, theme: theme, article: article.id
            )
            VStack(spacing: 0) {
                if let pagination {
                    TabView(selection: $page) {
                        ForEach(pagination.pages.indices, id: \.self) { index in
                            PageView(pagination: pagination, page: index)
                                .contentShape(Rectangle())
                                .onTapGesture { location in
                                    // The outer fifths turn the page, as in a book.
                                    if location.x < proxy.size.width * 0.2 { turn(by: -1) }
                                    else if location.x > proxy.size.width * 0.8 { turn(by: 1) }
                                }
                                .tag(index)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    footer(pageCount: pagination.pages.count)
                }
            }
            .onChange(of: key, initial: true) { _, key in layOut(key) }
        }
        .onChange(of: page) { _, page in
            anchor = pagination?.firstCharacter(onPage: page) ?? 0
        }
        .focusable()
        .focused($isFocused)
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) { turn(by: -1); return .handled }
        .onKeyPress(.rightArrow) { turn(by: 1); return .handled }
        .onKeyPress(.space) { turn(by: 1); return .handled }
        .onAppear { isFocused = true }
    }

    private func footer(pageCount: Int) -> some View {
        HStack {
            Text("\(page + 1) of \(pageCount)")
                .monospacedDigit()
            Spacer()
            if page == pageCount - 1 {
                Button(article.isRead ? "Read · mark as Ready" : "Mark as Read") {
                    withAnimation { article.readAt = article.isRead ? nil : .now }
                }
                .font(.interface(13, weight: .medium))
                .foregroundStyle(theme.ink)
            }
        }
        .font(.interface(12))
        .foregroundStyle(theme.muted)
        .padding(.horizontal, 24)
        .frame(height: 36)
    }

    private func turn(by delta: Int) {
        guard let count = pagination?.pages.count else { return }
        withAnimation { page = min(max(page + delta, 0), count - 1) }
    }

    private func layOut(_ key: LayoutKey) {
        guard key.size.width > 0, key.size.height > 36 else { return }
        let geometry = PageGeometry(size: CGSize(width: key.size.width, height: key.size.height - 36),
                                    requestedColumns: key.columns, lineWidth: key.lineWidth)
        let text = ArticleText.attributed(article, typeface: key.typeface, weight: key.weight,
                                          size: key.textSize, theme: key.theme)
        let pagination = Pagination(text: text, geometry: geometry)
        self.pagination = pagination
        page = pagination.page(containing: anchor)
    }
}

private struct LayoutKey: Equatable {
    var size: CGSize
    var columns: Int
    var typeface: Typeface
    var weight: FontWeight
    var textSize: Double
    var lineWidth: Double
    var theme: PageTheme
    var article: UUID
}

/// Column sizes and positions for one page.
struct PageGeometry {
    var columnSize: CGSize
    var columnOrigins: [CGPoint]

    static let gap: CGFloat = 44
    /// Two columns only when each can hold a comfortable line.
    static let minimumColumnWidth: CGFloat = 280

    init(size: CGSize, requestedColumns: Int, lineWidth: CGFloat) {
        let margin: CGFloat = size.width > 600 ? 56 : 28
        let top: CGFloat = 24
        let available = size.width - margin * 2
        let fitsTwo = (available - Self.gap) / 2 >= Self.minimumColumnWidth
        let count = requestedColumns >= 2 && fitsTwo ? 2 : 1
        let width = min(lineWidth, (available - Self.gap * CGFloat(count - 1)) / CGFloat(count))
        let blockWidth = width * CGFloat(count) + Self.gap * CGFloat(count - 1)
        let left = (size.width - blockWidth) / 2
        columnSize = CGSize(width: width, height: max(size.height - top, 1))
        columnOrigins = (0..<count).map { CGPoint(x: left + CGFloat($0) * (width + Self.gap), y: top) }
    }
}

/// The article flowed through a chain of TextKit containers, one per column.
final class Pagination {
    let layoutManager = NSLayoutManager()
    private let storage: NSTextStorage
    let geometry: PageGeometry
    private(set) var pages: [[NSTextContainer]] = []

    init(text: NSAttributedString, geometry: PageGeometry) {
        self.geometry = geometry
        storage = NSTextStorage(attributedString: text)
        storage.addLayoutManager(layoutManager)
        var page: [NSTextContainer] = []
        while true {
            let container = NSTextContainer(size: geometry.columnSize)
            container.lineFragmentPadding = 0
            layoutManager.addTextContainer(container)
            page.append(container)
            let range = layoutManager.glyphRange(for: container)
            if page.count == geometry.columnOrigins.count {
                pages.append(page)
                page = []
            }
            // Stop at the end, or if a column is too small to hold even one line.
            if NSMaxRange(range) >= layoutManager.numberOfGlyphs || range.length == 0 { break }
        }
        if !page.isEmpty { pages.append(page) }
    }

    func firstCharacter(onPage page: Int) -> Int {
        guard pages.indices.contains(page), let first = pages[page].first else { return 0 }
        let glyphs = layoutManager.glyphRange(for: first)
        return layoutManager.characterIndexForGlyph(at: glyphs.location)
    }

    func page(containing character: Int) -> Int {
        guard character > 0, layoutManager.numberOfGlyphs > 0 else { return 0 }
        let glyph = layoutManager.glyphIndexForCharacter(at: min(character, storage.length - 1))
        return pages.lastIndex { page in
            page.first.map { layoutManager.glyphRange(for: $0).location <= glyph } ?? false
        } ?? 0
    }
}

private struct PageView: UIViewRepresentable {
    let pagination: Pagination
    let page: Int

    final class Coordinator {
        var pagination: Pagination?
        var page: Int?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        let coordinator = context.coordinator
        guard coordinator.pagination !== pagination || coordinator.page != page else { return }

        // SwiftUI reuses page views when their index stays the same. Replace the
        // columns so they draw from the current text storage and layout manager.
        view.subviews.forEach { $0.removeFromSuperview() }
        for (container, origin) in zip(pagination.pages[page], pagination.geometry.columnOrigins) {
            let column = TextColumnView(layoutManager: pagination.layoutManager, container: container)
            column.frame = CGRect(origin: origin, size: pagination.geometry.columnSize)
            view.addSubview(column)
        }
        coordinator.pagination = pagination
        coordinator.page = page
    }

}

/// Draws one container's share of the article. Drawing, rather than a text view per
/// column, keeps a single layout for every page.
private final class TextColumnView: UIView {
    private let layoutManager: NSLayoutManager
    private let container: NSTextContainer

    init(layoutManager: NSLayoutManager, container: NSTextContainer) {
        self.layoutManager = layoutManager
        self.container = container
        super.init(frame: .zero)
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
        isAccessibilityElement = true
        accessibilityTraits = .staticText
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var accessibilityLabel: String? {
        get {
            let range = layoutManager.characterRange(forGlyphRange: layoutManager.glyphRange(for: container), actualGlyphRange: nil)
            return (layoutManager.textStorage?.string as NSString?)?.substring(with: range)
        }
        set {}
    }

    override func draw(_ rect: CGRect) {
        let glyphs = layoutManager.glyphRange(for: container)
        layoutManager.drawBackground(forGlyphRange: glyphs, at: .zero)
        layoutManager.drawGlyphs(forGlyphRange: glyphs, at: .zero)
    }
}

/// The reader's typography as an attributed string, matching the scrolling layout.
enum ArticleText {
    static func attributed(_ article: Article, typeface: Typeface, weight: FontWeight,
                           size: Double, theme: PageTheme) -> NSAttributedString {
        let size = CGFloat(size)
        let ink = UIColor(theme.ink), muted = UIColor(theme.muted)
        let text = NSMutableAttributedString()

        func append(_ string: String, font: UIFont, color: UIColor, lineSpacing: CGFloat = 0,
                    before: CGFloat = 0, after: CGFloat = 0, kern: CGFloat = 0) {
            let style = NSMutableParagraphStyle()
            style.lineSpacing = lineSpacing
            style.paragraphSpacingBefore = before
            style.paragraphSpacing = after
            style.hyphenationFactor = 0.2
            text.append(NSAttributedString(string: string + "\n", attributes: [
                .font: font, .foregroundColor: color, .paragraphStyle: style, .kern: kern,
            ]))
        }

        if !article.displaySource.isEmpty {
            append(article.displaySource.uppercased(), font: .systemFont(ofSize: 12), color: muted, after: 18, kern: 1.6)
        }
        append(article.title, font: typeface.uiFont(size: size * 2.1, weight: weight), color: ink, lineSpacing: 2, after: 20)
        if !article.dek.isEmpty {
            append(article.dek, font: typeface.uiFont(size: size * 1.15, weight: weight), color: muted,
                   lineSpacing: size * 0.6, after: 20)
        }
        let byline = ([article.author].filter { !$0.isEmpty } + ["\(article.readingMinutes) min read"]).joined(separator: " · ")
        append(byline, font: .systemFont(ofSize: 12), color: muted, after: size * 2.4)

        let body = typeface.uiFont(size: size, weight: weight)
        let heading = typeface.uiFont(size: size * 1.3, weight: weight == .regular ? .medium : weight)
        for paragraph in article.paragraphs {
            if paragraph.hasPrefix("## ") {
                append(String(paragraph.dropFirst(3)), font: heading, color: ink, before: size * 0.8, after: size * 0.6)
            } else {
                append(paragraph, font: body, color: ink, lineSpacing: size * 0.62, after: size * 1.1)
            }
        }
        return text
    }
}
