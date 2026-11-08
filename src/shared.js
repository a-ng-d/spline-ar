// Utilitaires communs au player, à la page Créer et à la galerie d'affiches.
//
// Format du lien (sans base de données pour la collection, comme SplineXR) :
//   /?o=<cible>*<scène>*<s>*<x>*<y>*<z>*<ry>&o=…&t=<titre>
//   - une « œuvre » par paramètre o (jusqu'à MAX_ITEMS)
//   - <cible>  identifiant créé sur la page Créer (ou URL d'un JSON de cible, encodée)
//   - <scène>  identifiant Spline (prod.spline.design/<id>/scene.splinecode) ou URL .glb encodée
//   - réglages en fin de chaîne omis quand ils valent leur défaut
// Les anciens liens ?scene=…&target=…&s=… restent lisibles.

export const MAX_ITEMS = 32   // affiches cherchées par le moteur 8th Wall
export const MAX_TRACKED = 4  // affiches suivies en même temps
export const DEFAULTS = { s: 0.8, x: 0, y: 0, z: 0, ry: 0 }
const KEYS = ['s', 'x', 'y', 'z', 'ry']

// Identifiant de cible créé par la page Créer (stocké sur Netlify Blobs).
export const ID_RE = /^[a-z0-9]{6,24}$/
// Identifiant de scène Spline (même règle que SplineXR).
export const SCENE_ID_RE = /^[A-Za-z0-9_-]{6,64}$/

export const DEMO = { target: '/image-targets/affiche-demo.json', poster: '/demo/affiche-demo.jpg',
  scene: 'h7gKpO9w4utya2UU' }

// "abc123" → "/c/abc123/target.json" ; une URL est laissée telle quelle.
export function targetUrl(value) {
  if (!value) return null
  return ID_RE.test(value) ? `/c/${value}/target.json` : value
}

export function posterUrl(value) {
  if (!value) return DEMO.poster
  return ID_RE.test(value) ? `/c/${value}/affiche.jpg` : value
}

// Accepte : URL prod Spline, identifiant seul, ou URL .glb/.gltf.
// Renvoie une référence courte : l'identifiant Spline, ou l'URL complète du GLB.
export function sceneRef(input) {
  const s = (input || '').trim()
  const m = s.match(/prod\.spline\.design\/([A-Za-z0-9_-]+)/)
  if (m && SCENE_ID_RE.test(m[1])) return m[1]
  if (SCENE_ID_RE.test(s)) return s
  return s || null
}

export const isGltfRef = ref => /\.(glb|gltf)(\?|#|$)/i.test(ref || '')

export function sceneUrl(ref) {
  if (!ref) return null
  if (SCENE_ID_RE.test(ref)) return `https://prod.spline.design/${ref}/scene.splinecode`
  return ref
}

const fmt = v => String(+(+v).toFixed(3))
const SEP = '*'
const enc = v => encodeURIComponent(v).replace(/\*/g, '%2A')

export function encodeItem({ target, scene, ...r }) {
  const vals = KEYS.map(k => (Number.isFinite(r[k]) ? r[k] : DEFAULTS[k]))
  while (vals.length && vals[vals.length - 1] === DEFAULTS[KEYS[vals.length - 1]]) vals.pop()
  return [enc(target), enc(sceneRef(scene)), ...vals.map(fmt)].join(SEP)
}

export function decodeItem(str) {
  const [target, scene, ...nums] = String(str).split(SEP).map(decodeURIComponent)
  const item = { target, scene: sceneRef(scene), ...DEFAULTS }
  KEYS.forEach((k, i) => { const v = parseFloat(nums[i]); if (Number.isFinite(v)) item[k] = v })
  return item
}

// Lit les œuvres depuis une query string (nouveau format o=…, ou ancien format).
export function readItems(search) {
  const p = new URLSearchParams(search)
  const items = p.getAll('o').filter(Boolean).map(decodeItem).filter(i => i.target && i.scene)
  if (items.length) return { title: p.get('t') || '', items: items.slice(0, MAX_ITEMS) }
  const num = (k) => { const v = parseFloat(p.get(k)); return Number.isFinite(v) ? v : DEFAULTS[k] }
  return {
    title: p.get('t') || '',
    items: [{
      target: p.get('target') || DEMO.target,
      scene: sceneRef(p.get('scene')) || DEMO.scene,
      s: num('s'), x: num('x'), y: num('y'), z: num('z'), ry: num('ry'),
    }],
  }
}

export function playerLink(origin, { title, items }) {
  const p = new URLSearchParams()
  if (title) p.set('t', title)
  items.forEach(i => p.append('o', encodeItem(i)))
  return `${origin}/?${p.toString()}`
}

export function galleryLink(origin, { title, items }) {
  const p = new URLSearchParams()
  if (title) p.set('t', title)
  items.forEach(i => p.append('a', i.target))
  return `${origin}/affiche.html?${p.toString()}`
}
