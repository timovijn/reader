# Folio

A quiet web article reader with warm paper tones, editorial typography, and an uncluttered reading view.

## Run locally

Node.js 22 or newer; no dependencies or installation required.

```sh
npm run build
npm test
npm run dev
```

Open http://127.0.0.1:4173. Alternatively run `node scripts/build.mjs`, `node scripts/test.mjs`, and `node scripts/preview.mjs` directly.

## Features

- Server fetch of publicly accessible article HTML with timeout, response-size limit, and restricted URLs/redirects.
- Browser extraction of the article body using semantic containers and paragraph scoring.
- Extracted content rebuilt from text and approved images, without scripts, original styles, embeds, or arbitrary HTML.
- Paste-text fallback for pages that cannot be fetched or extracted.
- Browser-local collection, three page colours, serif/sans type, adjustable text size and line width.
- Focus view and reading progress.
- Three original sample essays with custom vector illustrations.

## Boundaries

This is a first version. Extraction will not work with every website, and complex page layouts may yield imperfect results. Paywalls, authentication, bot protection, PDFs and JavaScript-only article bodies are not supported. It does not bypass access controls. Inline links and rich formatting are flattened to plain text; the source link is retained. Saved articles and preferences remain in localStorage in the current browser; there is no account sync. Images remain remote and contact their source hosts.

The production target is Cloudflare Workers. Run `node scripts/build.mjs` to generate `dist/server/index.js` and its hosting manifest. Site identity is retained in `.openai/hosting.json`. No database, secret, or external parsing service is required.

## Verification

`node scripts/test.mjs` checks JavaScript syntax, request routing, response policy, unsafe URL rejection, mocked article fetching, redirect checks, failure handling and response-size limits. Browser layout and real third-party fetches were not verified in the build environment, which blocked local listeners and external DNS. Hosting source upload was blocked by DNS resolution, so the app has not been deployed.
