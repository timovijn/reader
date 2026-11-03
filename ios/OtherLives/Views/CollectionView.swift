import SwiftUI
import SwiftData

/// My collection: Ready and Read articles, with search, status filter and sort.
struct CollectionView: View {
    @Binding var selection: Article?
    @Environment(\.modelContext) private var context
    @Query private var articles: [Article]
    @AppStorage(Preference.theme) private var theme: PageTheme = .stone
    @AppStorage("collectionStatus") private var status: ReadingStatus = .all
    @AppStorage("collectionSort") private var sort: CollectionSort = .newest
    @State private var query = ""
    @State private var isPastingText = false
    @State private var isShowingAppearance = false
    @FocusState private var isLinkFocused: Bool

    private var visible: [Article] {
        let filtered = articles.filter { article in
            switch status {
            case .all: true
            case .ready: !article.isRead
            case .read: article.isRead
            }
        }
        return sort.sorted(filtered.filter { $0.matches(query) })
    }

    var body: some View {
        Group {
            if articles.isEmpty {
                welcome
            } else {
                list
            }
        }
        .background(AmbientBackground())
        .navigationTitle("My collection")
        .toolbar {
            if !articles.isEmpty {
                ToolbarItem(placement: .topBarLeading) {
                    filterMenu
                }
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("Appearance", systemImage: "textformat.size") { isShowingAppearance = true }
                Menu("Add", systemImage: "plus") {
                    Button("Add link", systemImage: "link") { isLinkFocused = true }
                    Button("Paste article text", systemImage: "doc.on.clipboard") { isPastingText = true }
                }
            }
        }
        .sheet(isPresented: $isPastingText) {
            AddArticleView { article in
                selection = article
            }
        }
        .sheet(isPresented: $isShowingAppearance) {
            AppearanceView()
        }
    }

    private var linkField: some View {
        LinkField(onAdd: { selection = $0 }, onPasteText: { isPastingText = true }, isFocused: $isLinkFocused)
    }

    /// An empty collection puts the link field in the middle of the screen.
    private var welcome: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Text("Save something to read")
                .font(.interface(28, weight: .bold))
                .foregroundStyle(theme.ink)
            linkField
            VStack(alignment: .leading, spacing: 8) {
                Label("Or in Safari, tap Share, then other lives.", systemImage: "square.and.arrow.up")
                Button("Paste article text instead") { isPastingText = true }
                    .underline()
            }
            .font(.interface(12))
            .foregroundStyle(theme.muted)
            .padding(.horizontal, 16)
            Spacer()
            Spacer()
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity)
    }

    private var list: some View {
        List(selection: $selection) {
            linkField
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 12, trailing: 16))
                .selectionDisabled()

            ForEach(visible) { article in
                NavigationLink(value: article) {
                    ArticleRow(article: article)
                }
                .listRowBackground(selection == article ? theme.panel.opacity(0.7) : Color.clear)
                .listRowSeparatorTint(theme.line)
                .swipeActions(edge: .leading) {
                    Button(article.isRead ? "Ready" : "Read", systemImage: article.isRead ? "circle" : "checkmark.circle") {
                        toggleRead(article)
                    }
                    .tint(theme.muted)
                }
                .swipeActions(edge: .trailing) {
                    Button("Remove", systemImage: "trash", role: .destructive) {
                        remove(article)
                    }
                }
                .contextMenu {
                    Button(article.isRead ? "Mark as Ready" : "Mark as Read", systemImage: article.isRead ? "circle" : "checkmark.circle") {
                        toggleRead(article)
                    }
                    if let url = article.sourceURL {
                        ShareLink(item: url)
                    }
                    Button("Remove", systemImage: "trash", role: .destructive) {
                        remove(article)
                    }
                }
            }

            if visible.isEmpty {
                Text(query.isEmpty ? "No \(status.label.lowercased()) articles" : "No matches")
                    .font(.interface(14))
                    .foregroundStyle(theme.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .searchable(text: $query, prompt: "Search collection")
    }

    private var filterMenu: some View {
        Menu {
            Picker("Status", selection: $status) {
                ForEach(ReadingStatus.allCases) { Text($0.label).tag($0) }
            }
            Picker("Sort", selection: $sort) {
                ForEach(CollectionSort.allCases) { Text($0.label).tag($0) }
            }
        } label: {
            Label("Filter and sort", systemImage: status == .all ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
        }
    }

    private func toggleRead(_ article: Article) {
        withAnimation {
            article.readAt = article.isRead ? nil : .now
        }
    }

    private func remove(_ article: Article) {
        if selection == article { selection = nil }
        withAnimation {
            context.delete(article)
        }
    }
}

private struct ArticleRow: View {
    let article: Article
    @AppStorage(Preference.theme) private var theme: PageTheme = .stone

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !article.displaySource.isEmpty {
                Text(article.displaySource.uppercased())
                    .font(.interface(11))
                    .tracking(1.2)
                    .foregroundStyle(theme.muted)
            }
            Text(article.title)
                .font(.interface(19, weight: .medium))
                .foregroundStyle(theme.ink)
                .lineLimit(3)
            Text(meta)
                .font(.interface(12))
                .foregroundStyle(theme.muted)
                .lineLimit(1)
        }
        .padding(.vertical, 8)
        .opacity(article.isRead ? 0.62 : 1)
    }

    private var meta: String {
        var parts: [String] = []
        if !article.author.isEmpty { parts.append(article.author) }
        parts.append("\(article.readingMinutes) min read")
        parts.append(article.isRead ? "Read" : "Ready")
        return parts.joined(separator: " · ")
    }
}
