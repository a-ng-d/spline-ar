# Spline AR

Deux usages, dans le navigateur du téléphone, avec un simple lien :

- **Musée d'affiches** : une scène 3D sort de chaque affiche visée (caméra arrière).
- **Filtre visage** façon Snapchat : une scène 3D s'accroche au visage et réagit aux expressions (caméra selfie).

- **Suivi de l'affiche** : moteur [8th Wall](https://8thwall.org) (binaire distribué, chargé depuis jsDelivr), image target, sans suivi du monde.
- **Scène Spline** : runtime Spline officiel (`@splinetool/runtime`) — animations, états, sons et interactions comme dans Spline.
- **GLB / glTF** : three.js pur (`super-three`, comme SplineXR), animations jouées.

## Pages

| Page | Rôle |
|---|---|
| `/creer.html` | Choix du parcours : musée ou filtre visage |
| `/musee.html` | Une ou plusieurs affiches, chacune avec sa scène et ses réglages → un lien « expo » + QR code. Un lien existant peut être rechargé pour être modifié |
| `/` | Le player AR (le lien) : jusqu'à 32 affiches cherchées, 4 suivies en même temps |
| `/filtre.html` | Scène + point d'ancrage + réglages → lien + QR (rien n'est envoyé au serveur) |
| `/visage.html` | Le filtre visage (le lien) |
| `/affiche.html?a=<id>&a=…` | Galerie des affiches d'une expo, plein écran au clic (← → pour passer de l'une à l'autre) ; `?target=<id>` = une seule affiche |

## Le lien

La collection vit dans le lien (pas de base de données pour l'expo, comme SplineXR) :

```
https://<site>/?t=<titre>&o=<cible>*<scène>*<s>*<x>*<y>*<z>*<ry>&o=…
```

| Champ | Rôle | Défaut |
|---|---|---|
| `t` | titre de l'expo (écran d'accueil) | — |
| `o` | une œuvre par paramètre, champs séparés par `*` ; réglages de fin omis s'ils valent leur défaut | — |
| `<cible>` | identifiant créé sur `/creer.html`, ou URL d'un JSON de cible (encodée) | — |
| `<scène>` | identifiant Spline (`prod.spline.design/<id>/…`) ou URL `.glb` encodée | — |
| `s` | taille, en largeur d'affiche (1 = aussi large que l'affiche) | `0.8` |
| `x`, `y` | décalage, en largeur d'affiche | `0` |
| `z` | décollement de l'affiche, en largeur d'affiche | `0` |
| `ry` | rotation autour de l'axe vertical (degrés) | `0` |

Options : `moteur=loader` (ancien rendu three.js, scènes Spline figées), `debug=1` (cadre, axes, infos de suivi). Les liens v0.2 `?scene=…&target=…&s=…` restent lisibles. Sans paramètre : affiche et scène de démo.

Chargement : la scène de la première œuvre est préchargée, les autres à la première détection de leur affiche. Au plus 4 scènes Spline restent en mémoire ; la plus ancienne hors champ est libérée au besoin.

Repère de l'affiche (moteur 8th Wall) : plan XY, +Z vers le spectateur, le grand côté du 3:4 vaut 1. La 3D est centrée sur l'affiche, son arrière posé sur le plan.

## Filtre visage

```
https://<site>/visage.html?scene=<id Spline ou URL .glb>&p=<point>&s=1&x=0&y=0.15&z=0&ry=0&t=<titre>
```

- Moteur 8th Wall `FaceController` (chunk `face`), caméra selfie, affichage en miroir, un visage.
- `p` : point d'ancrage du moteur — `forehead` (défaut), `noseBridge`, `noseTip`, `mouth`, `chin`, `leftEar`, `rightEar`, ou `face` (centre). `s`, `x`, `y`, `z` en largeur de visage.
- **Expressions → variables Spline** : si la scène déclare une variable booléenne `bouche`, `clinGauche`, `clinDroit` ou `sourcils`, elle passe à vrai pendant l'expression (`app.setVariable`). Dans Spline, un événement « Variable Change » déclenche l'animation ou le son.
- Pas d'occultation par la tête : un objet derrière la tête (branches de lunettes, arrière d'un chapeau) reste visible.

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

## Titre et aperçu des liens

Le titre `t` s'affiche sur l'écran d'accueil (avec une étiquette « Musée · N affiches », « Affiche AR » ou « Filtre visage ») et dans l'onglet. `netlify/edge-functions/apercu.js` l'écrit aussi dans le HTML servi (`<title>`, Open Graph) pour l'aperçu des liens partagés (WhatsApp, Slack, mail).

## Design

Tokens et composants repris de SplineXR (`src/theme.css`, fond animé `src/background.js`) : fond `#06060f`, violet `#7b6ef6`, cyan `#3ecfcf`, DM Sans, cartes en verre.

## Développement

```bash
npm install
netlify dev      # proxy Spline + fonctions + Blobs
npm run build    # → dist/
```

Déploiement Netlify : site relié au dépôt, build `npm run build`, dossier publié `dist/`.
