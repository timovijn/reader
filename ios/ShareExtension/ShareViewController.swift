import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Safari share sheet → other lives.
///
/// In Safari, Extractor.js runs on the open page first, so the extension receives the
/// article text exactly as the reader sees it. The clip is handed to the app through the
/// App Group inbox and the app opens on it. From apps that share only a link, the app
/// opens and imports the link itself.
final class ShareViewController: UIViewController {
    private let status = ShareStatus()

    override func viewDidLoad() {
        super.viewDidLoad()
        let host = UIHostingController(rootView: ShareView(status: status) { [weak self] in self?.close() })
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await share() }
    }

    private func share() async {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        let clip = await preprocessedClip(from: providers)
        let destination: URL?
        if let clip, clip.hasArticleText, let id = try? Inbox.write(clip) {
            destination = AppLink.inbox(id)
        } else if let link = URL(string: clip?.url ?? ""), link.scheme?.hasPrefix("http") == true {
            destination = AppLink.add(link)
        } else if let link = await sharedURL(from: providers) {
            destination = AppLink.add(link)
        } else {
            destination = nil
        }

        guard let destination else {
            status.state = .failed
            return
        }
        if openContainingApp(destination) {
            close()
        } else {
            // The clip is already in the inbox; the app collects it the next time it opens.
            status.state = .saved
        }
    }

    private func preprocessedClip(from providers: [NSItemProvider]) async -> ArticleClip? {
        let type = UTType.propertyList.identifier
        guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(type) }),
              let item = try? await provider.loadItem(forTypeIdentifier: type),
              let results = (item as? NSDictionary)?[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any]
        else { return nil }
        return ArticleClip(dictionary: results) ?? ArticleClip(urlOnly: results["url"] as? String)
    }

    private func sharedURL(from providers: [NSItemProvider]) async -> URL? {
        let type = UTType.url.identifier
        guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(type) }),
              let item = try? await provider.loadItem(forTypeIdentifier: type)
        else { return nil }
        return item as? URL
    }

    /// Extensions cannot call UIApplication.shared; the application is reachable through
    /// the responder chain instead.
    private func openContainingApp(_ url: URL) -> Bool {
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url)
                return true
            }
            responder = current.next
        }
        return false
    }

    private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}

private extension ArticleClip {
    init?(urlOnly url: String?) {
        guard let url else { return nil }
        self.init(dictionary: ["url": url, "body": [[String]]()])
    }
}

@MainActor @Observable
final class ShareStatus {
    enum State { case saving, saved, failed }
    var state = State.saving
}

private struct ShareView: View {
    let status: ShareStatus
    var onDone: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            switch status.state {
            case .saving:
                ProgressView()
                Text("Saving to other lives…")
            case .saved:
                Image(systemName: "checkmark.circle").font(.largeTitle)
                Text("Saved to other lives")
                Button("Done", action: onDone).buttonStyle(.borderedProminent)
            case .failed:
                Image(systemName: "exclamationmark.circle").font(.largeTitle)
                Text("No article was found to save.")
                Button("Close", action: onDone).buttonStyle(.bordered)
            }
        }
        .font(.body)
        .foregroundStyle(Color(red: 0.95, green: 0.94, blue: 0.91))
        .tint(Color(red: 0.27, green: 0.26, blue: 0.23))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.22, green: 0.21, blue: 0.2))
    }
}
