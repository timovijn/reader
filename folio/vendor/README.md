# Vendored HTML parsing runtime

- parse5 7.3.0 — https://github.com/inikulin/parse5 — MIT; original licence in `parse5/LICENSE`.
- entities 6.0.1 — https://github.com/fb55/entities — BSD-2-Clause; original licence in `entities/LICENSE`.

These published ESM distributions were copied from the locally installed packages so the project can build and test without package-registry access. Their original package metadata and licences are retained. CommonJS output is omitted. The two parse5 imports of `entities/decode` and `entities/escape` use relative paths to the vendored ESM files instead of external package resolution. No parser logic was changed.

Only `lib/article-extractor.js` imports this runtime. Parsing does not execute publisher JavaScript or load remote resources. Reader HTML is not created with untrusted `innerHTML`; the client builds allowlisted elements from the extracted text/token data.
