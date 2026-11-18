import SwiftUI
import MessageUI

struct KindleSettingsSection: View {
    @AppStorage(KindlePreference.email) private var email = ""

    var body: some View {
        Section {
            TextField("Kindle email", text: $email, prompt: Text("name@kindle.com"))
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !email.isEmpty && !KindlePreference.isValid(email) {
                Text("Enter your Send to Kindle address ending in @kindle.com.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Link("Amazon document settings", destination: URL(string: "https://www.amazon.com/hz/mycd/myx#/home/settings")!)
        } header: {
            Text("Kindle")
        } footer: {
            Text("Find your Kindle email in your Kindle’s Settings → Your account, or Amazon’s document settings. Add the email address you send from to Amazon’s Approved Personal Document Email List. Articles are attached as EPUBs; you press Send in Mail.")
        }
    }
}

struct KindleSendView: View {
    let article: Article
    @Environment(\.dismiss) private var dismiss
    @AppStorage(KindlePreference.email) private var email = ""
    @AppStorage(Preference.theme) private var theme: PageTheme = .light
    @State private var isComposing = false
    @State private var hasPrepared = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if isComposing {
                KindleMailComposer(address: KindlePreference.address(email), title: article.title,
                                   document: KindleDocument(article: article)) { error in
                    if let error {
                        errorMessage = error.localizedDescription
                        isComposing = false
                    } else {
                        dismiss()
                    }
                }
            } else {
                NavigationStack {
                    Form {
                        KindleSettingsSection()
                        Section {
                            if MFMailComposeViewController.canSendMail() {
                                Button("Continue to Mail", systemImage: "envelope") {
                                    isComposing = true
                                }
                                .disabled(!KindlePreference.isValid(email))
                            } else {
                                Text("To send to your saved address, set up an account in Apple Mail. You can also share the article file to another mail app or the Kindle app.")
                                ShareLink(item: KindleDocument(article: article), preview: SharePreview(article.title)) {
                                    Label("Share article file", systemImage: "square.and.arrow.up")
                                }
                            }
                            if let errorMessage {
                                Text("Mail could not send the article: \(errorMessage)")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .navigationTitle("Send to Kindle")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { dismiss() }
                        }
                    }
                }
            }
        }
        .preferredColorScheme(theme.colorScheme)
        .tint(theme.ink)
        .onAppear {
            guard !hasPrepared else { return }
            hasPrepared = true
            if KindlePreference.isValid(email) && MFMailComposeViewController.canSendMail() {
                isComposing = true
            }
        }
    }
}

private struct KindleMailComposer: UIViewControllerRepresentable {
    let address: String
    let title: String
    let document: KindleDocument
    let onFinish: (Error?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let composer = MFMailComposeViewController()
        composer.mailComposeDelegate = context.coordinator
        composer.setToRecipients([address])
        composer.setSubject(title)
        composer.setMessageBody("Sent from other lives.", isHTML: false)
        composer.addAttachmentData(document.data, mimeType: "application/epub+zip", fileName: document.filename)
        return composer
    }

    func updateUIViewController(_ controller: MFMailComposeViewController, context: Context) {}

    final class Coordinator: NSObject, MFMailComposeViewControllerDelegate {
        let onFinish: (Error?) -> Void
        init(onFinish: @escaping (Error?) -> Void) { self.onFinish = onFinish }

        func mailComposeController(_ controller: MFMailComposeViewController,
                                   didFinishWith result: MFMailComposeResult, error: Error?) {
            let failure = result == .failed ? NSError(domain: "KindleMail", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Please try sending again from Mail."]) : nil
            onFinish(error ?? failure)
        }
    }
}
