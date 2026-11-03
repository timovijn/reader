import Foundation

/// An article extracted from a web page by Extractor.js, in the web reader's browser-clip format.
struct ArticleClip: Codable, Sendable {
    var title: String
    var author: String
    var published: String
    var excerpt: String
    var siteName: String
    var url: String
    /// Blocks as [tag, text] pairs; tags are p, h2, h3, blockquote or pre.
    var body: [[String]]

    init?(dictionary: [String: Any]) {
        guard let blocks = dictionary["body"] as? [[Any]] else { return nil }
        let string = { (key: String) in (dictionary[key] as? String) ?? "" }
        title = string("title")
        author = string("author")
        published = string("published")
        excerpt = string("excerpt")
        siteName = string("siteName")
        url = string("url")
        body = blocks.compactMap { block in
            guard block.count >= 2, let tag = block[0] as? String, let text = block[1] as? String else { return nil }
            return [tag, text]
        }
    }

    /// Paragraphs for storage; headings are kept with a "## " prefix.
    var paragraphs: [String] {
        body.compactMap { block in
            let text = block[1].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return ["h2", "h3"].contains(block[0]) ? "## " + text : text
        }
    }

    /// The web reader rejects clips with less than 180 characters of text.
    var hasArticleText: Bool {
        body.reduce(0) { $0 + $1[1].count } >= 180
    }
}

/// Clips handed from the share extension to the app through the shared App Group container.
enum Inbox {
    static let appGroup = "group.com.timovijn.otherlives"

    static var directory: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appending(path: "Inbox", directoryHint: .isDirectory)
    }

    static func write(_ clip: ArticleClip) throws -> UUID {
        guard let directory else { throw CocoaError(.fileNoSuchFile) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let id = UUID()
        try JSONEncoder().encode(clip).write(to: directory.appending(path: "\(id.uuidString).json"), options: .atomic)
        return id
    }

    /// Reads and removes one clip, or every waiting clip when `id` is nil, oldest first.
    static func take(_ id: UUID? = nil) -> [ArticleClip] {
        guard let directory,
              let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])
        else { return [] }
        let created = { (url: URL) in (try? url.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast }
        return files
            .filter { $0.pathExtension == "json" && (id == nil || $0.deletingPathExtension().lastPathComponent == id?.uuidString) }
            .sorted { created($0) < created($1) }
            .compactMap { file in
                defer { try? FileManager.default.removeItem(at: file) }
                return try? JSONDecoder().decode(ArticleClip.self, from: Data(contentsOf: file))
            }
    }
}

/// URLs the share extension uses to open the app.
enum AppLink {
    static let scheme = "otherlives"

    static func inbox(_ id: UUID) -> URL {
        URL(string: "\(scheme)://inbox/\(id.uuidString)")!
    }

    static func add(_ articleURL: URL) -> URL {
        var components = URLComponents()
        components.scheme = scheme
        components.host = "add"
        components.queryItems = [URLQueryItem(name: "url", value: articleURL.absoluteString)]
        return components.url!
    }
}
