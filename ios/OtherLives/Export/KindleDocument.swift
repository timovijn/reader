import Foundation
import CoreTransferable
import UniformTypeIdentifiers

/// A reflowable EPUB with explicit article metadata and no fixed fonts or colours.
struct KindleDocument: Transferable {
    let data: Data
    let filename: String

    init(article: Article) {
        let title = Self.escape(article.title)
        var content = "<h1>\(title)</h1>"
        if !article.author.isEmpty { content += "<p>\(Self.escape(article.author))</p>" }
        if !article.displaySource.isEmpty { content += "<p>\(Self.escape(article.displaySource))</p>" }
        if !article.dek.isEmpty { content += "<p><em>\(Self.escape(article.dek))</em></p>" }
        for paragraph in article.paragraphs {
            if paragraph.hasPrefix("## ") {
                content += "<h2>\(Self.escape(String(paragraph.dropFirst(3))))</h2>"
            } else {
                content += "<p>\(Self.escape(paragraph))</p>"
            }
        }
        if let url = article.sourceURL, ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
            content += "<p><a href=\"\(Self.escape(url.absoluteString))\">Original article</a></p>"
        }
        let xhtml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml"><head><title>\(title)</title></head>
        <body><article>\(content)</article></body></html>
        """
        let creator = article.author.isEmpty ? "" : "<dc:creator>\(Self.escape(article.author))</dc:creator>"
        let modified = ISO8601DateFormatter().string(from: Date())
        let package = """
        <?xml version="1.0" encoding="UTF-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="article-id">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="article-id">urn:uuid:\(article.id.uuidString)</dc:identifier>
        <dc:title>\(title.isEmpty ? "Article" : title)</dc:title><dc:language>und</dc:language>\(creator)
        <meta property="dcterms:modified">\(modified)</meta>
        </metadata><manifest>
        <item id="article" href="article.xhtml" media-type="application/xhtml+xml"/>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        </manifest><spine><itemref idref="article"/></spine></package>
        """
        let navigation = """
        <?xml version="1.0" encoding="UTF-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <head><title>Contents</title></head><body>
        <nav epub:type="toc"><h1>Contents</h1><ol><li><a href="article.xhtml">\(title.isEmpty ? "Article" : title)</a></li></ol></nav>
        </body></html>
        """
        data = EPUBArchive.pack([
            ("mimetype", "application/epub+zip"),
            ("META-INF/container.xml", """
            <?xml version="1.0" encoding="UTF-8"?>
            <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
            <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
            </container>
            """),
            ("EPUB/package.opf", package),
            ("EPUB/nav.xhtml", navigation),
            ("EPUB/article.xhtml", xhtml),
        ])
        let safeTitle = article.title.components(separatedBy: CharacterSet.alphanumerics.union(.whitespaces).inverted)
            .filter { !$0.isEmpty }.joined(separator: " ").trimmingCharacters(in: .whitespaces)
        filename = String((safeTitle.isEmpty ? "Article" : safeTitle).prefix(100)) + ".epub"
    }

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .epub) { $0.data }
            .suggestedFileName { $0.filename }
    }

    private static func escape(_ text: String) -> String {
        let validXML = text.unicodeScalars.filter {
            $0.value == 0x9 || $0.value == 0xA || $0.value == 0xD ||
                (0x20...0xD7FF).contains($0.value) || (0xE000...0xFFFD).contains($0.value) ||
                (0x10000...0x10FFFF).contains($0.value)
        }
        return String(String.UnicodeScalarView(validXML)).replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }
}

enum KindlePreference {
    static let email = "kindleEmail"

    static func address(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func isValid(_ value: String) -> Bool {
        let value = address(value)
        let parts = value.split(separator: "@", omittingEmptySubsequences: false)
        return parts.count == 2 && !parts[0].isEmpty && parts[1].lowercased() == "kindle.com"
            && value.rangeOfCharacter(from: .whitespacesAndNewlines) == nil
            && value.rangeOfCharacter(from: CharacterSet(charactersIn: ",;<>\"")) == nil
    }
}

/// The five small, UTF-8 files in this EPUB use ZIP's stored method. In particular,
/// EPUB requires mimetype to be the first entry, uncompressed, with no extra field.
private enum EPUBArchive {
    static func pack(_ files: [(String, String)]) -> Data {
        var archive = Data(), directory = Data()
        for (path, text) in files {
            let name = Data(path.utf8), bytes = Data(text.utf8)
            let checksum = crc32(bytes), offset = UInt32(archive.count), size = UInt32(bytes.count)
            archive.word32(0x04034B50)
            archive.word16(20); archive.word16(0x0800); archive.word16(0)
            archive.word16(0); archive.word16(0x0021) // 1 January 1980
            archive.word32(checksum); archive.word32(size); archive.word32(size)
            archive.word16(UInt16(name.count)); archive.word16(0)
            archive.append(name); archive.append(bytes)

            directory.word32(0x02014B50)
            directory.word16(20); directory.word16(20)
            directory.word16(0x0800); directory.word16(0)
            directory.word16(0); directory.word16(0x0021)
            directory.word32(checksum); directory.word32(size); directory.word32(size)
            directory.word16(UInt16(name.count)); directory.word16(0); directory.word16(0)
            directory.word16(0); directory.word16(0); directory.word32(0); directory.word32(offset)
            directory.append(name)
        }
        let directoryOffset = UInt32(archive.count)
        archive.append(directory)
        archive.word32(0x06054B50)
        archive.word16(0); archive.word16(0)
        archive.word16(UInt16(files.count)); archive.word16(UInt16(files.count))
        archive.word32(UInt32(directory.count)); archive.word32(directoryOffset); archive.word16(0)
        return archive
    }

    private static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xFFFFFFFF
        for byte in data {
            crc ^= UInt32(byte)
            for _ in 0..<8 { crc = (crc >> 1) ^ (crc & 1 == 1 ? 0xEDB88320 : 0) }
        }
        return crc ^ 0xFFFFFFFF
    }
}

private extension Data {
    mutating func word16(_ value: UInt16) {
        append(UInt8(truncatingIfNeeded: value)); append(UInt8(truncatingIfNeeded: value >> 8))
    }
    mutating func word32(_ value: UInt32) {
        word16(UInt16(truncatingIfNeeded: value)); word16(UInt16(truncatingIfNeeded: value >> 16))
    }
}
