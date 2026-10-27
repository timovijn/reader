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

## Deploy to Vercel

Push the updated source to the repository connected to Vercel, then deploy the new commit.

- **Root Directory:** leave at the repository root (recommended). The `folio` subdirectory is also supported.
- **Framework Preset:** Other.
- Build command and output directory are set in `vercel.json`; remove any conflicting dashboard overrides. At the repository root they are `npm run build` and `folio/dist/public`; with Root Directory `folio`, output is `dist/public`.
- Use Node.js 22 or newer. No dependencies, environment variables, database or secrets are required.

The build emits `dist/public/index.html`. Vercel separately deploys `api/article.js` as a Node.js function; this endpoint fetches article pages. Do not deploy only the HTML folder, or article URLs will not work. The Node adapter checks DNS results and pins outgoing connections to a public address.

The Cloudflare Worker output remains available in `dist/server/index.js`. A Sites `.openai/hosting.json` manifest is copied if present, but is optional for Vercel and local builds.

## Verification

`node scripts/test.mjs` checks JavaScript syntax, request routing, response policy, unsafe URL rejection, mocked article fetching, redirect checks, failure handling and response-size limits. It also checks the generated static homepage, both Vercel entry points and configurations, a mocked successful Vercel article request, private DNS rejection and connection pinning. These checks use no network.

Browser layout, real third-party fetches and a live Vercel deployment have not been verified in this environment.
