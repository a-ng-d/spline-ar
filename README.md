# Spline AR

Faire sortir une scène 3D d'une affiche, dans le navigateur du téléphone, avec un simple lien.

- **Suivi de l'affiche** : moteur [8th Wall](https://8thwall.org) (binaire distribué, chargé depuis jsDelivr), image target, sans suivi du monde.
- **Rendu** : three.js pur (`super-three`, comme SplineXR). Pas d'A-Frame.
- **3D** : scène Spline publiée (`.splinecode`, via `@splinetool/loader`) ou fichier `.glb`/`.gltf`.

## Le lien

```
https://<site>/?scene=<URL 3D>&target=<URL cible>&s=0.8&x=0&y=0&z=0&ry=0
```

| Paramètre | Rôle | Défaut |
|---|---|---|
| `scene` | `.splinecode` (Spline publié) ou `.glb` / `.gltf` | scène de démo |
| `target` | JSON de cible généré par 8th Wall | `/image-targets/affiche-demo.json` |
| `s` | taille, en largeur d'affiche (1 = aussi large que l'affiche) | `0.8` |
| `x`, `y` | décalage, en largeur d'affiche | `0` |
| `z` | décollement de l'affiche, en largeur d'affiche | `0` |
| `ry` | rotation autour de l'axe vertical (degrés) | `0` |
| `debug` | `1` = cadre de l'affiche, axes, infos de suivi | — |

Repère de l'affiche : plan XY, hauteur = 1, +Z sort vers le spectateur. La 3D est centrée sur l'affiche, son arrière posé sur le plan.

## Tester

1. Ouvrir `https://<site>/affiche.html` sur un ordinateur (ou imprimer `public/demo/affiche-demo.jpg`).
2. Ouvrir `https://<site>/?debug=1` sur le téléphone, toucher « Lancer l'AR », viser l'affiche.

## Cibles

Une cible = un JSON + son image de luminance (niveaux de gris, 640 px de haut, recadrée en 3:4). Le JSON peut être hébergé n'importe où (CORS) : l'image est résolue à côté du JSON (`resources.luminanceImage`).

Génération : `npx @8thwall/image-target-cli@latest`, ou l'appli 8th Wall Desktop.

## Limites connues

- `@splinetool/loader` ne fournit ni les événements ni les animations Spline (voir son README) : une scène Spline arrive figée. Les animations d'un `.glb` sont jouées (`AnimationMixer`).
- Le CDN Spline n'envoie pas d'en-têtes CORS : proxy `/spline-proxy/*` dans `netlify.toml` (absent en `npm run dev`, utiliser `netlify dev`).

## Développement

```bash
npm install
npm run dev
npm run build   # → dist/
```

Déploiement Netlify : build `npm run build`, dossier publié `dist/`.
