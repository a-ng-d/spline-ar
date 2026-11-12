# Spline AR

**Bring your Spline scenes out of a poster, or wear them on your face — in the phone's browser, with a simple link.**

[Live site](https://spline-ar.netlify.app) · [Français](README.fr.md) · [Contributing](CONTRIBUTING.md)

Spline AR is an open-source WebAR tool made for design students. No app to install, no code, no Node.js for the people who use it: design a scene in [Spline](https://spline.design), paste its link, get a link + a QR code to share.

- **Poster museum** — one or more posters (image targets), each with its own Spline scene. The phone aiming at a poster sees its 3D come out (rear camera).
- **Face filter** — Snapchat-style: a Spline scene sticks to a point of the face, follows the head and can react to expressions (selfie camera).

Spline animations, states, sounds and tap interactions work as in Spline, because the official Spline runtime does the rendering. It is the twin of [SplineXR](https://github.com/a-ng-d/spline-xr) (the same idea, in VR headsets).

The interface is available in **English and French**. The browser language is used by default; a switch (EN | FR) changes it, and the choice is remembered.

## How it works

| Layer | Technology |
|---|---|
| Image and face tracking | [8th Wall](https://8thwall.org) engine, distributed binary loaded from jsDelivr (image targets, `FaceController`, no world tracking) |
| Spline scenes | Official runtime `@splinetool/runtime` on a transparent canvas above the camera; its camera follows the 8th Wall camera |
| GLB / glTF | three.js (`super-three`, as in SplineXR), animations played |
| Hosting | Netlify: static site, Functions + Blobs for poster images, an Edge Function for link previews |
| Interface language | [Tolgee](https://tolgee.io) (`@tolgee/web`) with JSON files in `locales/` |

## Addresses

| Address | Role |
|---|---|
| `/` | Home: create a museum or a filter, "Get started" (two templates) and "My creations" |
| `/musee?…` | Play a poster museum (rear camera) |
| `/filtre?…` | Play a face filter (selfie camera) |
| `/creer` | Choose what to create |
| `/creer/musee` | Museum editor: posters + scenes + settings → link + QR |
| `/creer/filtre` | Filter editor: scene + anchor point + settings → link + QR |
| `/musee/affiches?a=<id>&a=…` | The posters of a museum, to show on a screen (or print) and aim at |

The routes and URL parameters stay in French on purpose: they are already printed on posters and shared in QR codes, so changing them would break existing links. Everything else (code, comments, file names) is in English.

Pages are folders (`musee/index.html`…); `public/_redirects` serves addresses without a trailing slash and redirects legacy ones (`/visage`, `/affiches`, `*.html`). The `pretty-urls` plugin in `vite.config.js` does the same locally.

## The museum link

The collection lives in the link (no database for the museum itself):

```
https://<site>/musee?t=<title>&o=<target>*<scene>*<s>*<x>*<y>*<z>*<ry>*<pl>&o=…&r=<back link>
```

| Field | Role | Default |
|---|---|---|
| `t` | museum title (start screen, tab, link preview) | — |
| `o` | one artwork per parameter, fields separated by `*`; trailing settings are omitted when they equal their default | — |
| `<target>` | ID created in the editor, or URL of a target JSON (encoded) | — |
| `<scene>` | Spline ID (`prod.spline.design/<id>/…`) or encoded `.glb` URL | — |
| `s` | size, in poster widths (1 = as wide as the poster) | `0.8` |
| `x`, `y` | offset, in poster widths | `0` |
| `z` | lift from the poster, in poster widths | `0` |
| `ry` | rotation around the vertical axis (degrees) | `0` |
| `pl` | `0` poster on a wall; `1` poster lying flat (table, floor): scene stood up by 90°, base on the image, `z` = height | `0` |
| `r` | optional back link (https): the AR "Quit" button goes there, e.g. a ProtoPie Cloud prototype | — |

Options: `moteur=loader` (older three.js rendering, static Spline scenes), `debug=1` (frame, axes, tracking info). Without parameters: demo poster and scene.

The first artwork's scene is preloaded; the others load when their poster is first detected. At most 4 Spline scenes stay in memory. The engine searches up to 32 posters and tracks 4 at the same time.

## The face filter link

```
https://<site>/filtre?scene=<Spline ID or .glb URL>&p=<point>&s=1&x=0&y=0.15&z=0&ry=0&t=<title>&r=<back link>
```

- `p`: anchor point — `forehead` (default), `noseBridge`, `noseTip`, `mouth`, `chin`, `leftEar`, `rightEar`, or `face` (centre). `s`, `x`, `y`, `z` are in face widths.
- **Expressions → Spline variables**: if the scene declares a boolean variable `mouthOpen`, `leftEyeClosed`, `rightEyeClosed` or `eyebrowsRaised`, it turns true during the expression. In Spline, a "Variable Change" event starts the animation or the sound. The French names used by earlier versions (`bouche`, `clinGauche`, `clinDroit`, `sourcils`) still work.
- **Live tuning**: "Open" from the editor adds `&reglage=1&w=<id>` → sliders over the running filter; "Save" updates the creation (and the editor open in the other tab).
- No head occlusion: an object behind the head stays visible.

## How the Spline runtime is driven

The Spline runtime draws on its own transparent canvas above the video. Just before each of its renders (`_renderer.renderSplineScene`), `src/spline-runtime.js` replaces the pose and projection of its active camera with those of the 8th Wall camera, expressed in the Spline scene's frame (poster × settings × scale). Spline keeps everything else, including the raycasting for tap interactions.

These are undocumented internals: the `@splinetool/runtime` version is pinned (`2.0.151`). Check again before any upgrade.

## Targets

A target = a JSON file + its luminance image (greyscale, 640 px high, centre crop in 3:4; a landscape image is rotated by 90°), the same rules as `@8thwall/image-target-cli`.

- **In the editor**: the target is built in the browser (`src/target-maker.js`), then stored on **Netlify Blobs** (store `cibles`) by `netlify/functions/targets.mjs` (`POST /api/cibles`). `netlify/functions/target-file.mjs` serves `/c/<id>/target.json`, `luminance.jpg` and `affiche.jpg`.
- **By hand**: `npx @8thwall/image-target-cli@latest`. The JSON can be hosted anywhere (with CORS); the image is resolved next to the JSON.

## My creations

Museums and filters are saved in the browser (`localStorage`, key `spline-ar-creations`, `src/works.js`). **The share link is the single source of truth**: a creation is `{ id, type, search }`, where `search` is the link's query string. No account, no database for the collection (poster images are on Netlify Blobs, referenced by ID). The link also works as a backup from one device to another: open it, then "Edit".

## Translations

- Strings live in `locales/en.json` and `locales/fr.json` (nested keys, same structure in both files). English is the fallback.
- `src/i18n.js` sets up Tolgee (`FormatSimple` for `{param}` placeholders, `LanguageDetector` for the browser language, `LanguageStorage` to remember the choice) and exposes `t()`, `tn()` (one/other plurals), `setText()` and `mountLanguageSwitch()`.
- In HTML: `data-i18n="key"` (text), `data-i18n-html` (text with markup), `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-aria-label`, and `data-i18n-params='{"n":3}'`. Everything is re-translated when the language changes, without reloading.
- Link previews (`netlify/edge-functions/link-preview.js`) follow the `Accept-Language` header.

Adding a language: copy `locales/en.json`, translate the values, import it in `src/i18n.js` and add it to `LANGUAGES`, then to `STRINGS` in the edge function. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

```bash
npm install
npx netlify dev   # site + Spline proxy + Functions + Blobs
npm run build     # → dist/
```

`npm run dev` (Vite alone) works for the interface, but scenes need the Spline proxy and posters need the Functions: use `netlify dev`. AR needs HTTPS on the phone; use the Netlify deploy previews or a tunnel.

Deployment: a Netlify site linked to the repository, build `npm run build`, publish directory `dist/`.

## Known limits

- The Spline CDN sends no CORS headers: proxy `/spline-proxy/*` (`netlify.toml` and `public/_redirects`).
- Orthographic Spline cameras must be switched to perspective (reported in debug mode).
- Spline post-processing is not guaranteed on a transparent background.
- `POST /api/cibles` is open (no account): image sizes are limited on the server.
- 8th Wall image targets are planar: no VPS / location-based AR in the distributed engine.

## Attributions

Spline AR stands on the work of others. Thank you to them.

| Component | Use | License |
|---|---|---|
| [8th Wall engine](https://github.com/8thwall/engine) (`@8thwall/engine-binary`) by Niantic Spatial, Inc. | Image and face tracking | Distributed engine binary under its own [limited-use license](https://github.com/8thwall/engine/blob/main/LICENSE). It is **not** part of this repository and not covered by its license: it is loaded at runtime from jsDelivr, unmodified. See the [attribution guidelines](https://8thwall.org/docs/open-source). |
| XR Extras (`@8thwall/xrextras`) by 8th Wall | Loading, permission and error screens of the engine | See [its npm package](https://www.npmjs.com/package/@8thwall/xrextras) |
| [Spline](https://spline.design) runtime and loader (`@splinetool/runtime`, `@splinetool/loader`) | Rendering of Spline scenes | Published on npm by Spline; use subject to Spline's terms of service ([spline.design](https://spline.design)) |
| [Tolgee](https://github.com/tolgee/tolgee-js) (`@tolgee/web`) | Interface translation | BSD-3-Clause |
| [three.js](https://threejs.org) via [`super-three`](https://www.npmjs.com/package/super-three) | GLB / glTF rendering, maths | MIT |
| [node-qrcode](https://github.com/soldair/node-qrcode) (`qrcode`) | QR codes | MIT |
| [Netlify Blobs](https://github.com/netlify/blobs) (`@netlify/blobs`) | Storage of poster images | MIT |
| [Vite](https://vitejs.dev) | Build | MIT |
| [DM Sans](https://fonts.google.com/specimen/DM+Sans) via Google Fonts | Typeface | SIL Open Font License 1.1 |
| [SplineXR](https://github.com/a-ng-d/spline-xr) | Design tokens and components (`src/theme.css`, `src/background.js`) | Same author |

"Spline" is a trademark of Spline Design Inc.; "8th Wall" and "Niantic Spatial" belong to Niantic Spatial, Inc. This project is independent and **not affiliated with, endorsed or sponsored by** Spline or Niantic Spatial. The "Made with Spline" credit shown during AR links to spline.design.

## License

The code of this repository is released under the [MIT License](LICENSE). Third-party components keep their own licenses (see above); in particular, the 8th Wall engine binary is not covered by the MIT License.
