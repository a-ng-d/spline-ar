# Contributing to Spline AR

Thank you for wanting to help! Spline AR is a small tool made for design students, so the guiding rule is: **it must stay simple for the people who use it**. No account, no install, no code on their side — a Spline link in, a link + QR code out.

Contributions are welcome in English or French (issues, pull requests, discussions).

## Ways to help

- **Report a bug** — open an issue with the link that fails (museum or filter), the phone and browser, and what you expected. A screenshot of the error box helps a lot.
- **Suggest an idea** — open an issue first, so we can agree on the approach before you write code.
- **Translate** — fix a wording, or add a language (see below).
- **Write code** — pick an issue, say in a comment that you are on it, then open a pull request.
- **Share a template** — a Spline scene that shows off what the tool can do.

## Getting started

```bash
git clone https://github.com/a-ng-d/spline-ar.git
cd spline-ar
npm install
npx netlify dev     # site + Spline proxy + Functions + Blobs
npm run build       # must pass before you open a pull request
```

AR needs HTTPS and a real camera: test on a phone with a Netlify deploy preview (opened automatically on pull requests) or a tunnel. The face filter also works on a computer with a webcam.

## Project layout

```
index.html, creer/, musee/, filtre/   pages (one folder per route)
src/                                   page scripts and shared modules
  i18n.js                              Tolgee setup and DOM translation helpers
  shared.js, filter-shared.js          link format (read / write), defaults, templates
  spline-runtime.js                    drives the Spline runtime with the 8th Wall camera
  target-maker.js                      builds image targets in the browser
  works.js, works-ui.js                "My creations" (localStorage)
locales/en.json, locales/fr.json       interface strings
netlify/functions/                     poster upload and serving (Netlify Blobs)
netlify/edge-functions/                link previews (title, Open Graph)
```

## Conventions

- **Code in English**: identifiers, comments, file names, commit messages.
- **No user-facing text in the code**: every string goes through a key in `locales/*.json` (`t('key')` in JS, `data-i18n="key"` in HTML). Add the key to **both** files, with the same structure.
- **Do not break existing links.** Routes (`/musee`, `/filtre`, `/creer`…), URL parameters (`o`, `t`, `r`, `pl`, `reglage`…), the `localStorage` keys, the `/api/cibles` endpoint and the Blobs store are in French for historical reasons and are printed on posters and QR codes. Keep them, or add a redirect / a backward-compatible reader.
- **Keep the link as the single source of truth** for a creation: no server-side database for museums or filters.
- **Pinned dependencies**: `@splinetool/runtime` is pinned because `src/spline-runtime.js` relies on undocumented internals. Upgrade it only in a dedicated pull request, tested on a phone with an animated, interactive scene.
- **8th Wall engine**: it is loaded from jsDelivr under its own license. Do not commit its files to the repository.
- Style: plain ES modules, no framework, no TypeScript, 2-space indentation, no semicolons — follow the surrounding code.

## Translations

Strings live in `locales/<lang>.json` as nested keys. Placeholders use `{name}` (Tolgee `FormatSimple`); plurals use `.one` / `.other` sub-keys with `tn()`.

To **add a language**:

1. Copy `locales/en.json` to `locales/<code>.json` and translate the values (keep the keys and the `{placeholders}`; keep HTML tags in values that have them).
2. In `src/i18n.js`, import the file, add it to `staticData` and `availableLanguages`, and add an entry to `LANGUAGES`.
3. In `netlify/edge-functions/link-preview.js`, add the language to `STRINGS`.
4. Run `npm run build` and check every page with the switch.

## Pull requests

- One topic per pull request, with a short description of what changes for students.
- Explain how you tested it (phone, browser, museum and/or filter).
- Screenshots or a short video for visual changes.
- `npm run build` passes.
- Translations updated in every `locales/*.json` file.

## Code of conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By taking part, you agree to respect it.

## License

By contributing, you agree that your contributions are released under the [MIT License](LICENSE) of the project.
