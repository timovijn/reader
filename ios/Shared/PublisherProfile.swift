import Foundation

/// Generated JSON is shared with the web transport; keep publisher settings there.
struct PublisherProfile: Decodable, Sendable {
    let id: String
    let domain: String
    let pathPattern: String
    let userAgent: String
    let retryStatuses: [Int]
    let blockedResourcePatterns: [String]

    static let all: [PublisherProfile] = {
        guard let url = Bundle.main.url(forResource: "PublisherProfiles", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let profiles = try? JSONDecoder().decode([PublisherProfile].self, from: data)
        else { return [] }
        return profiles
    }()

    static func matching(_ url: URL) -> PublisherProfile? {
        guard let host = url.host()?.lowercased(),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return nil }
        return all.first {
            (host == $0.domain || host.hasSuffix("." + $0.domain)) &&
            url.path().range(of: $0.pathPattern, options: .regularExpression) != nil
        }
    }

    /// WKWebView executes page scripts, unlike our server fetcher, so block the
    /// metering resources identified in the supplied cleaner before navigation.
    var contentRules: String? {
        let rules = blockedResourcePatterns.map { pattern in
            ["trigger": ["url-filter": pattern], "action": ["type": "block"]]
        }
        guard let data = try? JSONSerialization.data(withJSONObject: rules) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
