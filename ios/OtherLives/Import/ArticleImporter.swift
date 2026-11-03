import Foundation
import SwiftData
import WebKit

/// Adds articles from links and from share-extension clips.
///
/// Links open in an off-screen web view and run the same Extractor.js as the Safari
/// share extension and the website's bookmarklet. Nothing is sent to a server.
@MainActor @Observable
final class ArticleImporter {
    struct Pending: Identifiable {
        let id = UUID()
        let url: URL
    }

    enum ImportError: LocalizedError {
        case invalidLink, noArticleText, timedOut, loadFailed(String)

        var errorDescription: String? {
            switch self {
            case .invalidLink: "Please paste a complete http or https article link."
            case .noArticleText: "No article text was found on this page. It may need a sign-in, or you can paste its text instead."
            case .timedOut: "This article took too long to open. Please try again."
            case .loadFailed(let reason): "Unable to open this article. \(reason)"
            }
        }
    }

    private(set) var pending: [Pending] = []
    var lastError: String?

    /// Accepts a full link, or a bare domain and path such as "example.com/story".
    static func articleURL(from text: String) -> URL? {
        var text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.contains("://") { text = "https://" + text }
        guard let url = URL(string: text), ["http", "https"].contains(url.scheme?.lowercased()),
              let host = url.host(), host.contains(".") else { return nil }
        return url
    }

    func importLink(_ text: String, into context: ModelContext) async -> Article? {
        lastError = nil
        guard let url = Self.articleURL(from: text) else {
            lastError = ImportError.invalidLink.localizedDescription
            return nil
        }
        if let existing = existingArticle(for: url, in: context),
           !existing.author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return existing }
        let item = Pending(url: url)
        pending.append(item)
        defer { pending.removeAll { $0.id == item.id } }
        do {
            let clip = try await PageExtractor().extract(from: url)
            return save(clip, fallbackURL: url, into: context)
        } catch {
            lastError = error.localizedDescription
            return nil
        }
    }

    /// Saves clips waiting in the App Group inbox. Returns the article for `id`, when given.
    @discardableResult
    func importInbox(_ id: UUID? = nil, into context: ModelContext) -> Article? {
        Inbox.take(id).compactMap { save($0, fallbackURL: nil, into: context) }.last
    }

    private func save(_ clip: ArticleClip, fallbackURL: URL?, into context: ModelContext) -> Article? {
        let url = URL(string: clip.url) ?? fallbackURL
        if let url, let existing = existingArticle(for: url, in: context) {
            if existing.author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               !clip.author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                existing.author = clip.author
            }
            return existing
        }
        let article = Article(
            title: clip.title.isEmpty ? "Untitled article" : clip.title,
            author: clip.author,
            source: clip.siteName,
            sourceURL: url,
            dek: clip.excerpt,
            body: clip.paragraphs.joined(separator: "\n\n")
        )
        context.insert(article)
        return article
    }

    private func existingArticle(for url: URL, in context: ModelContext) -> Article? {
        let key = Self.comparable(url)
        let articles = (try? context.fetch(FetchDescriptor<Article>())) ?? []
        return articles.first { $0.sourceURL.map(Self.comparable) == key }
    }

    /// Links match regardless of query, fragment, scheme or a "www." prefix.
    private static func comparable(_ url: URL) -> String {
        let host = (url.host() ?? "").lowercased().replacingOccurrences(of: "www.", with: "")
        return host + url.path().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
}

/// Loads one page in an off-screen web view and runs Extractor.js on it.
@MainActor
private final class PageExtractor: NSObject, WKNavigationDelegate {
    private static let script: String = {
        guard let url = Bundle.main.url(forResource: "Extractor", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else { return "" }
        return source
    }()

    private let webView: WKWebView
    private var loaded: CheckedContinuation<Void, Error>?

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 1024, height: 1366), configuration: configuration)
        super.init()
        webView.navigationDelegate = self
    }

    func extract(from url: URL) async throws -> ArticleClip {
        let timeout = Task { [weak self] in
            try await Task.sleep(for: .seconds(35))
            self?.webView.stopLoading()
            self?.finish(ArticleImporter.ImportError.timedOut)
        }
        defer { timeout.cancel() }
        if let profile = PublisherProfile.matching(url) {
            webView.customUserAgent = profile.userAgent
            if let rules = profile.contentRules {
                let list = try await WKContentRuleListStore.default().compileContentRuleList(
                    forIdentifier: "other-lives-" + profile.id,
                    encodedContentRuleList: rules
                )
                if let list { webView.configuration.userContentController.add(list) }
            }
        }
        try await load(url)
        // Pages that render their text with scripts get a moment longer.
        for delay in [0.3, 1.5, 3.0] {
            try await Task.sleep(for: .seconds(delay))
            if let clip = try await runExtractor(), clip.hasArticleText { return clip }
        }
        throw ArticleImporter.ImportError.noArticleText
    }

    private func load(_ url: URL) async throws {
        try await withCheckedThrowingContinuation { continuation in
            loaded = continuation
            webView.load(URLRequest(url: url, timeoutInterval: 30))
        }
    }

    private func runExtractor() async throws -> ArticleClip? {
        let result = try await webView.evaluateJavaScript(Self.script + "\notherLivesExtract();")
        return (result as? [String: Any]).flatMap(ArticleClip.init(dictionary:))
    }

    private func finish(_ error: Error?) {
        guard let continuation = loaded else { return }
        loaded = nil
        switch error {
        case nil: continuation.resume()
        case let error as ArticleImporter.ImportError: continuation.resume(throwing: error)
        case let error?: continuation.resume(throwing: ArticleImporter.ImportError.loadFailed(error.localizedDescription))
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { finish(nil) }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        if navigationAction.targetFrame?.isMainFrame == true, let url = navigationAction.request.url {
            // Re-evaluate the publisher on main-frame redirects; another site
            // must not inherit NYT's request identity or metering rules.
            webView.customUserAgent = PublisherProfile.matching(url)?.userAgent
            if PublisherProfile.matching(url) == nil {
                webView.configuration.userContentController.removeAllContentRuleLists()
            }
        }
        return .allow
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(error) }
}
