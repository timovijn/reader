import SwiftUI

/// Full-bleed mesh of the theme's mineral tones, after the web reader's ambient background.
struct AmbientBackground: View {
    @AppStorage(Preference.theme) private var theme: PageTheme = .stone

    var body: some View {
        let tones = theme.ambient
        ZStack {
            theme.paper
            MeshGradient(
                width: 3, height: 3,
                points: [
                    [0, 0], [0.55, 0], [1, 0],
                    [0, 0.45], [0.4, 0.35], [1, 0.55],
                    [0, 1], [0.6, 1], [1, 1],
                ],
                colors: [
                    tones.light, tones.mid, tones.shadow,
                    tones.mid, tones.light.opacity(0.5), tones.mid,
                    tones.shadow, tones.mid, tones.shadow,
                ]
            )
        }
        .ignoresSafeArea()
    }
}

#Preview {
    AmbientBackground()
}
