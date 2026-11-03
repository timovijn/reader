import SwiftUI
import SwiftData

@main
struct OtherLivesApp: App {
    init() {
        Typeface.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: Article.self)
    }
}
