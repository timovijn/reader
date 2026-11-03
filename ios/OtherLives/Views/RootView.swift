import SwiftUI
import SwiftData

struct RootView: View {
    @AppStorage(Preference.theme) private var theme: PageTheme = .stone
    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase
    @State private var importer = ArticleImporter()
    @State private var selection: Article?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            CollectionView(selection: $selection)
                .navigationSplitViewColumnWidth(min: 320, ideal: 380, max: 460)
        } detail: {
            if let selection {
                ReaderView(article: selection)
                    .id(selection.id)
            } else {
                AmbientBackground()
                    .overlay {
                        Text("Choose an article to read")
                            .font(.interface(14))
                            .foregroundStyle(theme.muted)
                    }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .environment(importer)
        .tint(theme.ink)
        .preferredColorScheme(theme.colorScheme)
        .task { SampleContent.seedIfRequested(in: context) }
        .onOpenURL(perform: open)
        .onChange(of: scenePhase, initial: true) { _, phase in
            // Collect anything the share extension saved while the app was closed.
            if phase == .active { importer.importInbox(into: context) }
        }
    }

    /// Handles links from the Safari share extension.
    private func open(_ url: URL) {
        guard url.scheme == AppLink.scheme else { return }
        switch url.host() {
        case "inbox":
            let id = UUID(uuidString: url.lastPathComponent)
            if let id, let article = importer.importInbox(id, into: context) {
                show(article)
            }
        case "add":
            let link = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "url" }?.value
            guard let link else { return }
            Task {
                if let article = await importer.importLink(link, into: context) { show(article) }
            }
        default:
            break
        }
    }

    private func show(_ article: Article) {
        selection = article
        columnVisibility = .detailOnly
    }
}
