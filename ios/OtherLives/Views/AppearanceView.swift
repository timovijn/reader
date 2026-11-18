import SwiftUI

struct AppearanceView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(Preference.theme) private var theme: PageTheme = .light
    @AppStorage(Preference.typeface) private var typeface: Typeface = .newYork
    @AppStorage(Preference.weight) private var weight: FontWeight = .regular
    @AppStorage(Preference.textSize) private var textSize = Preference.defaultTextSize
    @AppStorage(Preference.lineWidth) private var lineWidth = Preference.defaultLineWidth
    @AppStorage(Preference.paragraphNumbers) private var paragraphNumbers = true
    @AppStorage(Preference.readingLayout) private var layout: ReadingLayout = .scroll
    @AppStorage(Preference.pageColumns) private var columns = 2

    var body: some View {
        NavigationStack {
            Form {
                Section("Appearance") {
                    HStack(spacing: 14) {
                        ForEach(PageTheme.allCases) { option in
                            Button {
                                theme = option
                            } label: {
                                VStack(spacing: 6) {
                                    Circle()
                                        .fill(option.paper)
                                        .overlay(Text("Aa").font(typeface.font(size: 15, weight: .regular)).foregroundStyle(option.ink))
                                        .overlay(Circle().strokeBorder(theme == option ? theme.ink : option.line, lineWidth: theme == option ? 2 : 1))
                                        .frame(width: 48, height: 48)
                                    Text(option.label)
                                        .font(.interface(11))
                                        .foregroundStyle(theme.ink)
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(theme == option ? .isSelected : [])
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    Picker("Article layout", selection: $layout) {
                        ForEach(ReadingLayout.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    if layout == .pages {
                        Picker("Columns", selection: $columns) {
                            Text("One column").tag(1)
                            Text("Two columns").tag(2)
                        }
                        .pickerStyle(.segmented)
                    }
                } header: {
                    Text("Layout")
                } footer: {
                    if layout == .pages && columns == 2 {
                        Text("Two columns appear when the screen is wide enough, such as on iPad or iPhone in landscape.")
                    }
                }

                Section("Type") {
                    Picker("Typeface", selection: $typeface) {
                        ForEach(Typeface.allCases) { face in
                            Text(face.label).font(face.font(size: 17, weight: .regular)).tag(face)
                        }
                    }
                    .onChange(of: typeface) { _, face in weight = face.closestWeight(to: weight) }
                    Picker("Weight", selection: $weight) {
                        ForEach(typeface.weights) { Text($0.label).tag($0) }
                    }
                    LabeledContent("Size") {
                        Stepper("\(Int(textSize)) pt", value: $textSize, in: Preference.textSizes, step: 1)
                            .fixedSize()
                    }
                    VStack(alignment: .leading) {
                        Text("Line width")
                        Slider(value: $lineWidth, in: Preference.lineWidths, step: 20) {
                            Text("Line width")
                        } minimumValueLabel: {
                            Image(systemName: "arrow.right.and.line.vertical.and.arrow.left")
                        } maximumValueLabel: {
                            Image(systemName: "arrow.left.and.line.vertical.and.arrow.right")
                        }
                    }
                    Toggle("Paragraph numbers", isOn: $paragraphNumbers)
                        .disabled(layout == .pages)
                }

                KindleSettingsSection()

                Section("Preview") {
                    Text("The moment the page settles, the words come forward and everything else recedes.")
                        .font(typeface.font(size: textSize, weight: weight))
                        .lineSpacing(textSize * 0.5)
                        .foregroundStyle(theme.ink)
                        .listRowBackground(theme.paper)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .preferredColorScheme(theme.colorScheme)
        .tint(theme.ink)
    }
}

#Preview {
    AppearanceView()
}
