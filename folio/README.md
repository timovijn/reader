# Folio

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
- Server-side article extraction on Vercel/local preview using an HTML5 parser, article-container and paragraph scoring, link-density filtering, metadata and public JSON-LD fallback.
- Extracted content rebuilt from safe DOM elements, preserving links, emphasis and lists, while excluding images and their captions without executing publisher scripts or injecting arbitrary HTML.
- Paste-text fallback for pages that cannot be fetched or extracted.
- Browser-local collection, three page colours, serif/sans type, adjustable text size and line width.
- Focus view and reading progress.
- Three original sample essays.

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

The extractor parses HTML without running scripts or loading resources. It chooses prose-heavy semantic containers rather than navigation, comments or related links. Public Article JSON-LD is a fallback when the page has little usable prose; schema explicitly marked as paid is excluded from that fallback. Nothing bypasses a paywall or sign-in. Pages requiring client-side JavaScript or a browser challenge still need the paste-text option.

Third-party HTML parsing code and original licences are in `vendor/`: parse5 7.3.0 (MIT) and entities 6.0.1 (BSD-2-Clause). See `vendor/README.md` for source and local modifications.
