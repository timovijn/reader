import SwiftUI

/// A uniform, full-bleed page colour, including behind paged columns.
struct AmbientBackground: View {
    @AppStorage(Preference.theme) private var theme: PageTheme = .light

    var body: some View {
        theme.paper
            .ignoresSafeArea()
    }
}

#Preview {
    AmbientBackground()
}
