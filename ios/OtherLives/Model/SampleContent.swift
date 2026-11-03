import Foundation
import SwiftData

/// Debug-only sample article, inserted when launched with `-SeedSample YES`.
enum SampleContent {
    static func seedIfRequested(in context: ModelContext) {
        #if DEBUG
        guard UserDefaults.standard.bool(forKey: "SeedSample"),
              (try? context.fetchCount(FetchDescriptor<Article>())) == 0 else { return }
        context.insert(Article(
            title: "On Keeping a Reading Room",
            author: "Other Lives",
            source: "otherlives.app",
            dek: "A short note on why a quiet page matters, written to test the reader's typography.",
            body: """
            There is a particular quiet that settles over a page when everything around the words has been taken away. No sidebar, no list of other things to read, no flicker at the edge of the eye. Only the sentence in front of you and the next one waiting below it.

            A reading room is not a library. It holds very little, and that is its virtue. Each article is there because someone chose to put it there, and it stays until they have read it or decided they never will.

            The marks of reading are small. A piece moves from Ready to Read; a paragraph number slips past in the margin; the scroll bar shortens. None of it asks for attention, and all of it is there when you look.

            Type does most of the work. A serif with generous counters, set a little larger than feels necessary, at a measure that lets the eye return to the left edge without searching. The line spacing is open but not loose. The colours are those of paper and stone rather than of screens.

            When the article ends, the room is still there. You can go back to the collection, or simply sit with what you read.
            """
        ))
        #endif
    }
}
