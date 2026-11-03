import Foundation
import SwiftData

/// A saved article. The collection holds articles that are Ready (still to read) or Read.
@Model
final class Article {
    var id: UUID = UUID()
    var title: String = ""
    var author: String = ""
    var source: String = ""
    var sourceURL: URL?
    var dek: String = ""
    /// Plain text; paragraphs are separated by blank lines.
    var body: String = ""
    var savedAt: Date = Date.now
    var readAt: Date?
    var lastOpenedAt: Date?

    init(title: String, author: String = "", source: String = "", sourceURL: URL? = nil, dek: String = "", body: String) {
        self.title = title
        self.author = author
        self.source = source
        self.sourceURL = sourceURL
        self.dek = dek
        self.body = body
    }

    var isRead: Bool { readAt != nil }

    var paragraphs: [String] {
        Article.paragraphs(in: body)
    }

    var wordCount: Int {
        body.split(whereSeparator: \.isWhitespace).count
    }

    /// Minutes at 230 words per minute, matching the web reader.
    var readingMinutes: Int {
        max(1, Int((Double(wordCount) / 230).rounded()))
    }

    var displaySource: String {
        if !source.isEmpty { return source }
        return sourceURL?.host(percentEncoded: false)?.replacingOccurrences(of: "www.", with: "") ?? ""
    }

    static func paragraphs(in text: String) -> [String] {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
        // Prefer blank-line separation; fall back to single newlines for pasted text without it.
        let blocks = normalized.components(separatedBy: "\n\n")
        let source = blocks.count > 1 ? blocks : normalized.components(separatedBy: "\n")
        return source
            .map { $0.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

enum ReadingStatus: String, CaseIterable, Identifiable {
    case all, ready, read
    var id: Self { self }
    var label: String {
        switch self {
        case .all: "All"
        case .ready: "Ready"
        case .read: "Read"
        }
    }
}

enum CollectionSort: String, CaseIterable, Identifiable {
    case newest, oldest, title, shortest, longest, recentlyRead
    var id: Self { self }
    var label: String {
        switch self {
        case .newest: "Newest saved"
        case .oldest: "Oldest saved"
        case .title: "Title"
        case .shortest: "Shortest"
        case .longest: "Longest"
        case .recentlyRead: "Recently read"
        }
    }

    func sorted(_ articles: [Article]) -> [Article] {
        switch self {
        case .newest: articles.sorted { $0.savedAt > $1.savedAt }
        case .oldest: articles.sorted { $0.savedAt < $1.savedAt }
        case .title: articles.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        case .shortest: articles.sorted { $0.wordCount < $1.wordCount }
        case .longest: articles.sorted { $0.wordCount > $1.wordCount }
        case .recentlyRead: articles.sorted { ($0.lastOpenedAt ?? .distantPast) > ($1.lastOpenedAt ?? .distantPast) }
        }
    }
}

extension Article {
    /// Search ignores case and accents, across title, author, source and text.
    func matches(_ query: String) -> Bool {
        let query = query.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return true }
        let options: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
        return [title, author, displaySource, dek, body].contains { $0.range(of: query, options: options) != nil }
    }
}
