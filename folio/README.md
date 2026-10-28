# other lives

## Dictionary

Double-click a single word in article text to open an anchored English dictionary
popover. You can also select a word and press **D**, or choose **Define word**
from the reading controls. It shows IPA spellings, parts of speech, numbered
definitions and examples, with source/licence links. **Listen** uses the browser's
speech engine with a British English voice where available; it is not a provider
audio recording. Missing definitions, pronunciation and connection failures have
explicit states. Escape, Close, an outside click, scrolling or article navigation
dismisses it. Native text selection and copying remain available.

The Liquid Glass-inspired appearance is a theme-aware CSS approximation using a
bounded backdrop blur, translucent tint, edge highlights and shallow shadows.
It respects reduced motion, reduced transparency, forced colours and printing;
browsers without backdrop blur get an opaque surface. The article itself is not
filtered or changed.

`GET /api/dictionary?word=...` proxies a single validated word to Free Dictionary
API (`https://dictionaryapi.dev/`), falling back to Wiktionary's English definition
endpoint if the primary lookup fails or has no entry. Each result credits its
actual provider and licence. No article text, source URL or publisher login
is sent with the lookup. Each provider has a 5.5-second timeout and 512 KB response
limit. Successful entries are cached for 24 hours with at most 256 server entries
and 100 entries per browser session; concurrent server requests are deduplicated.
The route is available in both Vercel roots, local preview and the standalone
Worker. No API key is needed. Provider uptime and vocabulary coverage are external
dependencies. Provider failures log the provider and error, without article text.
Missing deployment routes are distinguished from missing dictionary entries.
Dictionary tests use mocked provider responses; a live response
could not be verified from the development environment.

Article titles are reconciled with visible headings, Article JSON-LD and author
metadata rather than treating an Open Graph/search title as the headline.
Confirmed publisher suffixes and corroborated trailing bylines are removed;
unverified “by” phrases and full visible headlines are preserved. The same
helper runs in the server importer, browser fallback and bookmarklet. Existing
collection titles are also corrected on loading when their saved author/source
metadata confirms a suffix, preserving content, identity and reading state.
Title and author extraction now run together: when a separate headline confirms
a combined title's trailing byline, the name is retained in the author field.
Original title metadata is kept for later repairs. Re-importing an already saved
article refreshes its title/author metadata while preserving its saved text,
save date and Read/Ready state.

## My collection

The collection combines **Ready** (saved and still to read) and **Read** articles.
Mark either state explicitly from a collection row or the reading controls;
scrolling to the bottom does not automatically mark an article read. **Save as
read** also saves an article that is not yet in the collection. Existing saved
articles start as Ready because previous versions did not record completion.

Search matches titles, authors, sources and article text, ignoring case and
common accents. Combine status, source and reading-time filters; sort by newest
or oldest saved, publication date, title, shortest/longest or most recently read.
Filter and sort choices persist in this browser. Returning from an article
restores the collection position and keyboard focus.

Rows load in batches of 40 as you approach the end, with **Show more** as an
explicit control and fallback. There is no longer a 100-article loading cap.
Legacy articles retain their original order until new save/read timestamps are
recorded. Content is still stored in this browser's localStorage and remains
subject to its storage capacity; there is no account or cross-device sync.
Storage failures roll back status changes rather than displaying an unsaved
state. `tests/collection.test.mjs` covers filtering, sorting, old collections,
progressive rendering, controls and persistence failure.

## Display refresh and animation

Pointer and progress fades use display-paced animation callbacks rather than
16 ms timers. The glow follows a delayed, critically damped spring with
continuous velocity through direction changes. Its elapsed-time integration
keeps the movement consistent across refresh rates, and reduced-motion mode
follows immediately. Stone, Parchment, Snow and Moss each have their own glow
colour and strength; Snow uses a warm tint so the glow remains distinguishable
against its light background. The CSS fallback follows the same spring.
Opacity updates are scoped to the relevant overlay elements;
pointer events are batched once per frame. Native arrow cursor images use 256
alpha steps, cached and prepared during idle time where supported.

Selection underlines are anchored to document coordinates and recalculated on
selection or layout changes, not on every scroll. Canvas geometry and fixed
uniforms are updated only when needed, and the background stops scheduling
frames once the glow settles or becomes invisible. Background resolution,
grain and colour composition are preserved. The header uses a small text-only
wordmark in the top-left corner.

`tests/animation-performance.test.mjs` checks animation timing at 60–240 Hz,
display-paced fades, input batching and renderer scheduling with a mock graphics
context. This is not an on-device frame-rate benchmark: sustained 120 fps still
depends on the browser, display, GPU and power settings.

## Concreteness experiment

Articles display an optional thin curve in the right text margin. Further right
means more tangible language; further left means more abstract language. Use
**Concreteness** in the reading controls to toggle it; this preference is saved
in the current browser. Hover the curve to see a qualitative estimate and some
of the vocabulary behind it. It is excluded from EPUB downloads and printing.

The curve uses a wider 64 px desktop gutter and a compact 32 px gutter on small
screens, with symmetric reading margins to make room. A fixed display scale
amplifies mid-range variation consistently across articles. Nearby sentence
scores are smoothed in source-text coordinates, then drawn through sentence
centres with continuous monotone cubic tangents, instead of changing direction
on each printed line. One short unsupported sentence may be bridged between
supported neighbours and is labelled interpolated on hover; longer unsupported
passages keep a gap. Source scores stay unchanged by zoom or reflow.

This first experiment uses a small, hand-weighted English vocabulary in the
browser, not a trained semantic model or a validated human-rating dataset.
Sentence estimates include nearby words with lower weight, and sparse evidence
is pulled towards neutral. Unknown words abstain; insufficient recognised
vocabulary hides the curve. Metaphor, ambiguous word meanings and other
languages are not reliably understood. Article text is not sent to an analysis
service. Scores are cached from source text; DOM ranges map them to the current
lines after font, width or zoom changes. Tests cover scoring, abstention and
geometry in `tests/concreteness.test.mjs`.

A quiet web article reader with a minimal typewriter interface, Shinka Mono typography, warm paper tones and a numbered reading list.

## Run locally

Node.js 22 or newer; no package installation required (HTML parsing dependencies are vendored).

```sh
npm run build
npm test
npm run dev
```

Open http://127.0.0.1:4173. Alternatively run `node scripts/build.mjs`, `node scripts/test.mjs`, and `node scripts/preview.mjs` directly.

## Features

- Server fetch of publicly accessible article HTML with timeout, response-size limit, and restricted URLs/redirects.
- Server-side article extraction on Vercel/local preview using an HTML5 parser, article-container and paragraph scoring, link-density filtering, metadata, public JSON-LD and common embedded application data.
- Extracted content rebuilt from safe DOM elements, preserving links, emphasis and lists, while excluding images and their captions without executing publisher scripts or injecting arbitrary HTML.
- Browser-assisted import via a clipboard bookmarklet for pages that refuse server requests, plus a paste-text fallback.
- My collection as the single home view, with browser-local saving, three page colours, serif/sans type, adjustable text size and line width.
- Focus view, subtle line numbers and underline-only text selection.
- Download EPUB from an article's controls or My collection. Exports include title, author, publication date, source link, headings and safe inline formatting, without images or interface decorations. Generation stays in the browser and requires no email account or extra service. For Kindle, upload the EPUB through [Send to Kindle](https://www.amazon.com/sendtokindle) for conversion; EPUB is not a native Kindle USB format.

## Typography

Shinka Mono is the default for the interface and article reading view. On the first visit to the typewriter design, existing reading preferences switch to Mono at 18px; subsequent choices remain saved. The reader also offers Martina Plantijn, Shinka, Shinka Mono, and System Sans under Appearance → Typeface. The selection applies to article titles, introductory text and body copy, and is remembered in this browser. The rest of the interface keeps its existing typography.

The font-weight selector lists each family's supplied weights: Martina Plantijn has Light through Black; Shinka adds Thin; Shinka Mono offers Thin through Bold. Switching families selects the closest available weight when necessary. Every supplied weight has its matching italic face.

Fonts are self-hosted from `fonts/MartinaPlantijn` (OTF) and `fonts/Shinka` (WOFF2), with `font-display: swap`. The build copies them into `dist/public/fonts` for Vercel and includes them in the Worker bundle for local preview and Cloudflare. Visitors do not need the fonts installed.

## Boundaries

This is a first version. Extraction will not work with every website, and complex page layouts may yield imperfect results. Paywalls, authentication, bot protection, PDFs and JavaScript-only article bodies are not supported. It does not bypass access controls. The Vercel/local importer preserves links and common inline formatting; saved plain-text articles remain compatible. The source link is retained. Saved articles and preferences remain in localStorage in the current browser; there is no account sync. Article images and captions are excluded from imports. Images in previously saved articles are not rendered, and the browser policy blocks external image requests.

## Deploy to Vercel

Push the updated source to the repository connected to Vercel, then deploy the new commit.

- **Root Directory:** leave at the repository root (recommended). The `folio` subdirectory is also supported.
- **Framework Preset:** Other.
- Build command and output directory are set in `vercel.json`; remove any conflicting dashboard overrides. At the repository root they are `npm run build` and `folio/dist/public`; with Root Directory `folio`, output is `dist/public`.
- Use Node.js 22 or newer. No package installation, environment variables, database or secrets are required.

The build emits `dist/public/index.html`. Vercel separately deploys `api/article.js` as a Node.js function; this endpoint fetches article pages. Do not deploy only the HTML folder, or article URLs will not work. The Node adapter checks DNS results and pins outgoing connections to a public address.

The Cloudflare Worker output remains available in `dist/server/index.js`. A Sites `.openai/hosting.json` manifest is copied if present, but is optional for Vercel and local builds. The standalone Worker retains the browser-extraction fallback; the enhanced HTML5 extraction and compressed Node transport run in Vercel and local preview.

## Verification

`node scripts/test.mjs` checks JavaScript syntax, request routing, response policy, unsafe URL rejection, mocked article fetching, redirect checks, failure handling and response-size limits. It also checks the generated static homepage, both Vercel entry points and configurations, a mocked successful Vercel article request, private DNS rejection and connection pinning. These checks use no network. `tests/importer.test.mjs` adds the WordPress `192.0.78.*` address regression, public IPv4-mapped IPv6, DNS connection failover, gzip/deflate/Brotli responses, HTML5 and structured-data extraction, formatting safety, lists/text-only imports, redirects, HTTP failures, and character encodings.

Browser layout, real third-party fetches and a live Vercel deployment have not been verified in this environment.

## Import engine

The Node transport validates each destination, filters private DNS answers, and pins sockets to public addresses on every redirect. It tries another public address if a connection fails. Requests share a 35-second deadline, DNS has a 5-second budget, and decoded page HTML is capped at 6 MB. Gzip, deflate and Brotli are decoded before enforcing the page limit. Server errors 502/503/504 receive one retry. DNS, access denial, rate limiting, missing articles, redirect loops, and extraction failures have separate error codes and readable messages.

The extractor parses HTML without running scripts or loading resources. It chooses prose-heavy semantic containers rather than navigation, comments or related links, and compares that result with public Article JSON-LD, Next.js JSON payloads, Nuxt object/indexed data, Apollo state and initial-state article objects. Article-body boundaries include nested blog content, image-caption components, newsletter widgets and author profiles. A second pass removes standalone newsletter prompts and labelled runs of related-story links even when they sit inside the article body. It resumes at normal prose, preserving subsequent interview answers, editorial references and ordinary lists. This cleanup runs before candidate ranking so a fallback cannot win merely by containing those extras. These are conservative structural rules, not a guarantee of perfect classification on every layout; regression cases are in `tests/article-boundaries.test.mjs`.

Candidate scoring rewards distinct prose and retains formatted HTML when another candidate is similar. Application data must identify the article by URL/title or belong to a named article/story/post/entry object; recommendation branches, mismatched stories and explicitly restricted metadata objects are excluded. Embedded HTML becomes text-only paragraphs without scripts, images or captions. Parsing and traversal have size/depth/work limits; executable application code is never evaluated. Publisher adapters remain available for exceptional formats such as Times paragraph blocks and New Yorker prose markers.

This layer extracts text present in the returned page. It does not sign in, execute client-side applications, or resolve browser challenges. Server-browser rendering is not configured. Sites that withhold text or refuse server requests still need browser-assisted import or pasted text. Regression fixtures for common data formats and candidate selection are in `tests/embedded-articles.test.mjs`.

Third-party HTML parsing code and original licences are in `vendor/`: parse5 7.3.0 (MIT) and entities 6.0.1 (BSD-2-Clause). See `vendor/README.md` for source and local modifications.

## Browser-assisted import

When a publisher returns HTTP 403, the extraction engine has not received the article. Use **Import from an open browser page** to install the **Copy for other lives** bookmarklet. Open an article you can access normally, click that bookmark, then paste the clip into other lives. It captures article text and metadata from the page DOM without images, makes no network requests from the source page, and does not collect cookies, form values, scripts or storage. Query strings and fragments are removed from the source URL. Imported clips stay in the current browser unless the user separately shares them.

The bookmarklet is a user-operated fallback; it does not solve CAPTCHAs, log in, bypass paywalls or guarantee that every page will work. Browser and publisher policies may block bookmarklets; manual text pasting remains available.
