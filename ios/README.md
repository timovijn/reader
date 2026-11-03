# other lives for iOS

Open `OtherLives.xcodeproj` and build the OtherLives scheme. The app imports links
locally with WKWebView; it does not call the Vercel importer. Safari's share
extension extracts the already open page and hands a plain-text clip to the app.

## Shared import logic

`scripts/build-extractor.py` generates `Shared/Extractor.js` using the website's
title/description helpers, content-boundary classifier, NYT data parser and
candidate selection. It also copies the web transport's
`folio/lib/publisher-profiles.json` into `Shared/PublisherProfiles.json`.
The Generate Shared Extractor build phase runs in the ShareExtension target,
which is a dependency of the app, before those shared resources are copied.
Both targets bundle the generated extractor and profiles.
The shared author resolver reads Article/NewsArticle JSON-LD (including graphs
and multiple authors), rejects author-profile URLs as names and ignores articles
with another URL. This covers NYT pages whose name appears only in JSON-LD.
Re-importing a saved article with an empty author refreshes that field while
preserving its stored body, dates and Read/Ready state. Existing nonempty author
fields are retained.

For dated NYT article URLs, the native WebKit loader uses the shared request
identity before navigation and installs the cleaner's scoped metering-resource
block patterns. Other publisher links use WebKit's default identity. Publisher
identity is re-evaluated for main-frame navigation. No Vercel deployment is
needed for native import changes; rebuild and install the iOS app.

The local extractor reads URL-matched typed article paragraphs from NYT's
preloaded data when present. It excludes image/ad blocks and keeps ordinary DOM
extraction as a fallback. Source scripts are parsed as data, never evaluated by
the extraction code. WKWebView itself renders page scripts as before; the Safari
share extension does not change Safari's request headers or install blockers.
Cookies remain in the app's nonpersistent web view and are not sent to Vercel.
Publisher responses can still differ by network/device; automatic access is not
guaranteed.

Run the generation and parity checks after changing extraction code:

```sh
python3 ios/scripts/build-extractor.py
node ios/scripts/test-extractor.mjs
```

The parity checks execute the generated native extractor with a synthetic NYT
page and compare the shared functions and configuration with the web engine.
The changed WebKit loader and shared Swift types were typechecked against the
iOS SDK with Swift 6 and warnings treated as errors. A full build in the agent
environment was blocked by sandbox restrictions affecting Xcode's macro plugin
server (Observation macros in the existing share extension); no on-device NYT
import was verified here.
