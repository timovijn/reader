import SwiftUI

/// The reading view: source, headline, introduction, byline and numbered paragraphs.
struct ReaderView: View {
    @Bindable var article: Article
    @AppStorage(Preference.theme) private var theme: PageTheme = .stone
    @AppStorage(Preference.typeface) private var typeface: Typeface = .newYork
    @AppStorage(Preference.weight) private var weight: FontWeight = .regular
    @AppStorage(Preference.textSize) private var textSize = Preference.defaultTextSize
    @AppStorage(Preference.lineWidth) private var lineWidth = Preference.defaultLineWidth
    @AppStorage(Preference.paragraphNumbers) private var paragraphNumbers = true
    @State private var isShowingAppearance = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                    .padding(.bottom, textSize * 2.4)
                LazyVStack(alignment: .leading, spacing: textSize * 1.1) {
                    ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                        if let heading = block.heading {
                            Text(heading)
                                .font(typeface.font(size: textSize * 1.3, weight: weight == .regular ? .medium : weight))
                                .foregroundStyle(theme.ink)
                                .padding(.top, textSize * 0.8)
                                .accessibilityAddTraits(.isHeader)
                        } else if let paragraph = block.paragraph, let number = block.number {
                        Text(paragraph)
                            .font(typeface.font(size: textSize, weight: weight))
                            .lineSpacing(textSize * 0.62)
                            .foregroundStyle(theme.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .overlay(alignment: .topLeading) {
                                if paragraphNumbers {
                                    Text("\(number)")
                                        .font(.interface(9))
                                        .foregroundStyle(theme.muted.opacity(0.7))
                                        .frame(width: 24, alignment: .trailing)
                                        .offset(x: -32, y: textSize * 0.35)
                                        .accessibilityHidden(true)
                                }
                            }
                        }
                    }
                }
                .textSelection(.enabled)
                footer
                    .padding(.top, textSize * 3)
            }
            .frame(maxWidth: lineWidth, alignment: .leading)
            .padding(.horizontal, paragraphNumbers ? 40 : 24)
            .padding(.vertical, 40)
            .frame(maxWidth: .infinity)
        }
        .background(AmbientBackground())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button(article.isRead ? "Mark as Ready" : "Mark as Read",
                       systemImage: article.isRead ? "checkmark.circle.fill" : "checkmark.circle") {
                    article.readAt = article.isRead ? nil : .now
                }
                Button("Appearance", systemImage: "textformat.size") { isShowingAppearance = true }
                ShareLink(item: shareText, subject: Text(article.title))
            }
        }
        .sheet(isPresented: $isShowingAppearance) {
            AppearanceView()
        }
        .onAppear { article.lastOpenedAt = .now }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !article.displaySource.isEmpty {
                Text(article.displaySource.uppercased())
                    .font(.interface(12))
                    .tracking(1.6)
                    .foregroundStyle(theme.muted)
                    .padding(.bottom, 18)
            }
            Text(article.title)
                .font(typeface.font(size: textSize * 2.1, weight: weight))
                .foregroundStyle(theme.ink)
                .lineSpacing(2)
                .padding(.bottom, 20)
            if !article.dek.isEmpty {
                Text(article.dek)
                    .font(typeface.font(size: textSize * 1.15, weight: weight))
                    .lineSpacing(textSize * 0.6)
                    .foregroundStyle(theme.muted)
                    .padding(.bottom, 20)
            }
            Text(byline)
                .font(.interface(12))
                .foregroundStyle(theme.muted)
        }
        .textSelection(.enabled)
    }

    private var footer: some View {
        HStack {
            Rectangle().fill(theme.line).frame(height: 1)
            Button(article.isRead ? "Read · mark as Ready" : "Mark as Read") {
                withAnimation { article.readAt = article.isRead ? nil : .now }
            }
            .font(.interface(13, weight: .medium))
            .foregroundStyle(theme.ink)
            .buttonStyle(.bordered)
            Rectangle().fill(theme.line).frame(height: 1)
        }
    }

    /// Paragraphs numbered in reading order; "## " marks an unnumbered heading.
    private var blocks: [(heading: String?, paragraph: String?, number: Int?)] {
        var number = 0
        return article.paragraphs.map { text in
            if text.hasPrefix("## ") { return (String(text.dropFirst(3)), nil, nil) }
            number += 1
            return (nil, text, number)
        }
    }

    private var byline: String {
        var parts: [String] = []
        if !article.author.isEmpty { parts.append(article.author) }
        parts.append("\(article.readingMinutes) min read")
        return parts.joined(separator: " · ")
    }

    private var shareText: String {
        if let url = article.sourceURL { return url.absoluteString }
        return ([article.title, article.author].filter { !$0.isEmpty } + article.paragraphs.map { $0.replacingOccurrences(of: "## ", with: "") })
            .joined(separator: "\n\n")
    }
}
