import SwiftUI
import SwiftData

/// Adds an article from pasted text. Nothing is fetched from the network.
struct AddArticleView: View {
    var onSave: (Article) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @AppStorage(Preference.theme) private var theme: PageTheme = .stone
    @State private var title = ""
    @State private var author = ""
    @State private var source = ""
    @State private var dek = ""
    @State private var text = ""
    @FocusState private var focusedTitle: Bool

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !Article.paragraphs(in: text).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title, axis: .vertical)
                        .focused($focusedTitle)
                    TextField("Author", text: $author)
                        .textContentType(.name)
                    TextField("Source or link", text: $source)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    TextField("Introduction (optional)", text: $dek, axis: .vertical)
                }
                Section {
                    TextEditor(text: $text)
                        .frame(minHeight: 220)
                        .font(.interface(17))
                } header: {
                    HStack {
                        Text("Article text")
                        Spacer()
                        PasteButton(payloadType: String.self) { strings in
                            text = strings.joined(separator: "\n\n")
                        }
                        .labelStyle(.titleAndIcon)
                        .buttonBorderShape(.capsule)
                        .controlSize(.mini)
                    }
                } footer: {
                    if !text.isEmpty {
                        Text("\(Article.paragraphs(in: text).count) paragraphs")
                    }
                }
            }
            .navigationTitle("Add article")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(!canSave)
                }
            }
            .onAppear { focusedTitle = true }
        }
        .preferredColorScheme(theme.colorScheme)
        .tint(theme.ink)
    }

    private func save() {
        let trimmedSource = source.trimmingCharacters(in: .whitespaces)
        let url = URL(string: trimmedSource).flatMap { $0.scheme?.hasPrefix("http") == true ? $0 : nil }
        let article = Article(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            author: author.trimmingCharacters(in: .whitespaces),
            source: url == nil ? trimmedSource : "",
            sourceURL: url,
            dek: dek.trimmingCharacters(in: .whitespacesAndNewlines),
            body: Article.paragraphs(in: text).joined(separator: "\n\n")
        )
        context.insert(article)
        onSave(article)
        dismiss()
    }
}
