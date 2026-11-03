import SwiftUI
import SwiftData

/// The primary way to add an article: paste or type its link.
struct LinkField: View {
    var onAdd: (Article) -> Void
    var onPasteText: () -> Void
    var isFocused: FocusState<Bool>.Binding
    @Environment(\.modelContext) private var context
    @Environment(ArticleImporter.self) private var importer
    @AppStorage(Preference.theme) private var theme: PageTheme = .stone
    @State private var link = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "link")
                    .foregroundStyle(theme.muted)
                TextField("Paste a link to an article", text: $link)
                    .font(.interface(15))
                    .foregroundStyle(theme.ink)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused(isFocused)
                    .onSubmit { add(link) }
                if link.isEmpty {
                    PasteButton(payloadType: URL.self) { urls in
                        guard let url = urls.first else { return }
                        Task { @MainActor in add(url.absoluteString) }
                    }
                    .labelStyle(.iconOnly)
                    .buttonBorderShape(.circle)
                    .tint(theme.panel)
                } else {
                    Button("Add", action: { add(link) })
                        .font(.interface(14, weight: .medium))
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                        .foregroundStyle(theme.paper)
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, 6)
            .frame(minHeight: 52)
            .background(theme.panel.opacity(0.75), in: .capsule)
            .overlay(Capsule().strokeBorder(theme.line.opacity(0.8), lineWidth: 1))

            ForEach(importer.pending) { item in
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Opening \(item.url.host() ?? item.url.absoluteString)…")
                        .font(.interface(12))
                        .foregroundStyle(theme.muted)
                        .lineLimit(1)
                }
                .padding(.horizontal, 16)
            }

            if let error = importer.lastError {
                VStack(alignment: .leading, spacing: 6) {
                    Text(error)
                        .font(.interface(12))
                        .foregroundStyle(theme.ink)
                    Button("Paste article text instead", action: onPasteText)
                        .font(.interface(12, weight: .medium))
                        .foregroundStyle(theme.ink)
                        .underline()
                }
                .padding(.horizontal, 16)
                .transition(.opacity)
            }
        }
        .animation(.default, value: importer.pending.count)
        .animation(.default, value: importer.lastError)
    }

    private func add(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isFocused.wrappedValue = false
        link = ""
        Task {
            if let article = await importer.importLink(text, into: context) {
                onAdd(article)
            } else {
                link = text
            }
        }
    }
}
