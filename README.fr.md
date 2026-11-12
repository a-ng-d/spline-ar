# Spline AR

**Fais sortir tes scènes Spline d'une affiche, ou porte-les sur le visage — dans le navigateur du téléphone, avec un simple lien.**

[Site en ligne](https://spline-ar.netlify.app) · [English](README.md) · [Contribuer](CONTRIBUTING.md)

Spline AR est un outil de réalité augmentée web, open source, pensé pour des étudiants en design. Pas d'appli à installer, pas de code, pas de Node.js pour celles et ceux qui l'utilisent : on crée une scène dans [Spline](https://spline.design), on colle son lien, on obtient un lien + un QR code à partager.

- **Musée d'affiches** — une ou plusieurs affiches (image targets), chacune avec sa scène Spline. Le téléphone qui vise une affiche voit sa 3D en sortir (caméra arrière).
- **Filtre visage** — façon Snapchat : une scène Spline s'accroche à un point du visage, suit la tête et peut réagir aux expressions (caméra selfie).

Animations, états, sons et interactions au toucher fonctionnent comme dans Spline, car c'est le runtime officiel de Spline qui dessine. C'est le jumeau de [SplineXR](https://github.com/a-ng-d/spline-xr) (la même idée, dans les casques VR).

L'interface existe en **anglais et en français**. La langue du navigateur est utilisée par défaut ; un sélecteur (EN | FR) permet de changer, et le choix est retenu.

## Fonctionnement

| Couche | Technologie |
|---|---|
| Suivi d'image et de visage | Moteur [8th Wall](https://8thwall.org), binaire distribué chargé depuis jsDelivr (image targets, `FaceController`, sans suivi du monde) |
| Scènes Spline | Runtime officiel `@splinetool/runtime` sur un canvas transparent au-dessus de la caméra ; sa caméra suit celle de 8th Wall |
| GLB / glTF | three.js (`super-three`, comme SplineXR), animations jouées |
| Hébergement | Netlify : site statique, Functions + Blobs pour les images d'affiches, une Edge Function pour l'aperçu des liens |
| Langue de l'interface | [Tolgee](https://tolgee.io) (`@tolgee/web`) avec des fichiers JSON dans `locales/` |

## Adresses

| Adresse | Rôle |
|---|---|
| `/` | Accueil : créer un musée ou un filtre, « Pour commencer » (deux modèles) et « Mes créations » |
| `/musee?…` | Jouer un musée d'affiches (caméra arrière) |
| `/filtre?…` | Jouer un filtre visage (caméra selfie) |
| `/creer` | Choisir quoi créer |
| `/creer/musee` | Éditeur de musée : affiches + scènes + réglages → lien + QR |
| `/creer/filtre` | Éditeur de filtre : scène + point d'ancrage + réglages → lien + QR |
| `/musee/affiches?a=<id>&a=…` | Les affiches d'un musée, à afficher sur un écran (ou imprimer) pour les viser |

Les adresses et les paramètres d'URL restent en français volontairement : ils sont déjà imprimés sur des affiches et partagés en QR codes, les changer casserait les liens existants. Tout le reste (code, commentaires, noms de fichiers) est en anglais.

## Le lien d'un musée

```
https://<site>/musee?t=<titre>&o=<cible>*<scène>*<s>*<x>*<y>*<z>*<ry>*<pl>&o=…&r=<lien de retour>
```

| Champ | Rôle | Défaut |
|---|---|---|
| `t` | titre du musée (écran d'accueil, onglet, aperçu du lien) | — |
| `o` | une œuvre par paramètre, champs séparés par `*` ; réglages de fin omis s'ils valent leur défaut | — |
| `<cible>` | identifiant créé dans l'éditeur, ou URL d'un JSON de cible (encodée) | — |
| `<scène>` | identifiant Spline (`prod.spline.design/<id>/…`) ou URL `.glb` encodée | — |
| `s` | taille, en largeur d'affiche | `0.8` |
| `x`, `y` | décalage, en largeur d'affiche | `0` |
| `z` | décollement de l'affiche, en largeur d'affiche | `0` |
| `ry` | rotation autour de l'axe vertical (degrés) | `0` |
| `pl` | `0` affiche au mur ; `1` affiche à plat (table, sol) : scène redressée de 90°, base sur l'image, `z` = hauteur | `0` |
| `r` | lien de retour facultatif (https) : le bouton « Quitter » de l'AR y renvoie, ex. un prototype ProtoPie Cloud | — |

Options : `moteur=loader` (ancien rendu three.js, scènes Spline figées), `debug=1`. Le moteur cherche jusqu'à 32 affiches et en suit 4 en même temps.

## Le lien d'un filtre visage

```
https://<site>/filtre?scene=<id Spline ou URL .glb>&p=<point>&s=1&x=0&y=0.15&z=0&ry=0&t=<titre>&r=<lien de retour>
```

- `p` : point d'ancrage — `forehead` (défaut), `noseBridge`, `noseTip`, `mouth`, `chin`, `leftEar`, `rightEar` ou `face` (centre).
- **Expressions → variables Spline** : une variable booléenne `mouthOpen`, `leftEyeClosed`, `rightEyeClosed` ou `eyebrowsRaised` passe à vrai pendant l'expression ; un événement « Variable Change » lance l'animation ou le son. Les noms français des versions précédentes (`bouche`, `clinGauche`, `clinDroit`, `sourcils`) marchent toujours.
- **Réglage en direct** : « Ouvrir » depuis l'éditeur ajoute `&reglage=1&w=<id>` → curseurs sur le filtre en cours ; « Enregistrer » met à jour la création.

## Traductions

Les textes sont dans `locales/en.json` et `locales/fr.json` (mêmes clés dans les deux fichiers ; l'anglais sert de repli). `src/i18n.js` configure Tolgee. Dans le HTML : `data-i18n`, `data-i18n-html`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-aria-label`, `data-i18n-params`. Pour ajouter une langue, voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Développement

```bash
npm install
npx netlify dev   # site + proxy Spline + Functions + Blobs
npm run build     # → dist/
```

Les détails techniques (pilotage du runtime Spline, cibles, « Mes créations », limites connues) sont dans le [README anglais](README.md).

## Attributions

Spline AR repose sur le travail d'autres projets — merci à eux. La liste complète, avec les licences, est dans le [README anglais](README.md#attributions). En résumé :

- **Moteur 8th Wall** (`@8thwall/engine-binary`) de Niantic Spatial, Inc. : binaire distribué sous sa propre [licence à usage limité](https://github.com/8thwall/engine/blob/main/LICENSE). Il ne fait **pas** partie de ce dépôt ni de sa licence : il est chargé tel quel depuis jsDelivr.
- **Runtime et loader Spline** (`@splinetool/runtime`, `@splinetool/loader`), soumis aux conditions de Spline.
- **Tolgee** (BSD-3-Clause), **three.js / super-three**, **qrcode**, **Netlify Blobs**, **Vite** (MIT), **DM Sans** (SIL OFL 1.1).

« Spline » est une marque de Spline Design Inc. ; « 8th Wall » et « Niantic Spatial » appartiennent à Niantic Spatial, Inc. Ce projet est indépendant, **sans lien** avec Spline ni Niantic Spatial.

## Licence

Le code de ce dépôt est sous [licence MIT](LICENSE). Les composants tiers gardent leurs propres licences ; le binaire du moteur 8th Wall n'est pas couvert par la licence MIT.
