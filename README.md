# Spline AR

Faire sortir une scène 3D d'une affiche, dans le navigateur du téléphone, avec un simple lien.

- **Suivi de l'affiche** : moteur [8th Wall](https://8thwall.org) (binaire distribué, chargé depuis jsDelivr), image target, sans suivi du monde.
- **Scène Spline** : runtime Spline officiel (`@splinetool/runtime`) — animations, états, sons et interactions comme dans Spline.
- **GLB / glTF** : three.js pur (`super-three`, comme SplineXR), animations jouées.

## Pages

| Page | Rôle |
|---|---|
| `/creer.html` | L'étudiant envoie son affiche, colle l'URL de sa scène, règle taille et position → lien + QR code |
| `/` | Le player AR (le lien) |
| `/affiche.html?target=<id>` | Affiche l'affiche en plein écran, pour tester sur un écran |

## Le lien

```
https://<site>/?scene=<URL 3D>&target=<id ou URL de cible>&s=0.8&x=0&y=0&z=0&ry=0
```

| Paramètre | Rôle | Défaut |
|---|---|---|
| `scene` | `.splinecode` (Spline → Export → Code) ou `.glb` / `.gltf` | scène de démo |
| `target` | identifiant créé sur `/creer.html`, ou URL d'un JSON de cible | affiche de démo |
| `s` | taille, en largeur d'affiche (1 = aussi large que l'affiche) | `0.8` |
| `x`, `y` | décalage, en largeur d'affiche | `0` |
| `z` | décollement de l'affiche, en largeur d'affiche | `0` |
| `ry` | rotation autour de l'axe vertical (degrés) | `0` |
| `moteur` | `loader` = ancien rendu three.js, scène Spline figée | runtime |
| `debug` | `1` = cadre de l'affiche, axes, infos de suivi | — |

Repère de l'affiche (moteur 8th Wall) : plan XY, +Z vers le spectateur, le grand côté du 3:4 vaut 1. La 3D est centrée sur l'affiche, son arrière posé sur le plan.

## Comment le runtime Spline est piloté

Le runtime Spline dessine sur son propre canvas (`#spline-canvas`), transparent, posé au-dessus de la vidéo. Juste avant chacun de ses rendus (`_renderer.renderSplineScene`), `src/spline-runtime.js` remplace la pose et la projection de sa caméra active par celles de la caméra 8th Wall, exprimées dans le repère de la scène Spline (affiche × réglages × mise à l'échelle). Spline garde tout le reste, y compris le lancer de rayons des interactions tactiles.

Ce sont des internes non documentés : la version de `@splinetool/runtime` est figée (`2.0.151`). À revérifier avant toute mise à jour.

La scène est mise en pause jusqu'à la première détection de l'affiche, puis tourne en continu (le son continue si l'affiche sort du champ).

## Cibles

Une cible = un JSON + son image de luminance (niveaux de gris, 640 px de haut, recadrée au centre en 3:4 ; une image paysage est tournée de 90°). Mêmes règles que `@8thwall/image-target-cli`.

- **Page Créer** : la cible est fabriquée dans le navigateur (`src/target-maker.js`), puis stockée sur **Netlify Blobs** (store `cibles`) par `netlify/functions/cibles.mjs` (`POST /api/cibles`). `netlify/functions/cible-fichier.mjs` sert `/c/<id>/target.json`, `luminance.jpg` et `affiche.jpg`.
- **À la main** : `npx @8thwall/image-target-cli@latest`, ou l'appli 8th Wall Desktop. Le JSON peut être hébergé n'importe où (CORS) : l'image est résolue à côté du JSON (`resources.luminanceImage`).

## Limites connues

- Le CDN Spline n'envoie pas d'en-têtes CORS : proxy `/spline-proxy/*` (`netlify.toml` et `public/_redirects`). En `npm run dev`, utiliser `netlify dev`.
- Caméra Spline orthographique : à passer en perspective (signalé en mode debug).
- Post-processing Spline : non garanti sur fond transparent.
- `POST /api/cibles` est ouvert (pas de compte) : taille des images limitée côté serveur.

## Développement

```bash
npm install
netlify dev      # proxy Spline + fonctions + Blobs
npm run build    # → dist/
```

Déploiement Netlify : site relié au dépôt, build `npm run build`, dossier publié `dist/`.
