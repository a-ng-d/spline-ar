// Utilitaires communs au player, à la page Créer et à la galerie d'affiches.
//
// Format du lien (sans base de données pour la collection, comme SplineXR) :
//   /musee?o=<cible>*<scène>*<s>*<x>*<y>*<z>*<ry>*<pl>&o=…&t=<titre>
//   - une « œuvre » par paramètre o (jusqu'à MAX_ITEMS)
//   - <cible>  identifiant créé sur la page Créer (ou URL d'un JSON de cible, encodée)
//   - <scène>  identifiant Spline (prod.spline.design/<id>/scene.splinecode) ou URL .glb encodée
//   - réglages en fin de chaîne omis quand ils valent leur défaut
//   - r=<url>  lien de retour facultatif (bouton Quitter de l'AR), ex. un prototype ProtoPie
// Les anciens liens ?scene=…&target=…&s=… restent lisibles.
//
// Adresses : /  accueil · /musee  jouer un musée · /musee/affiches  les affiches à viser ·
// /filtre  jouer un filtre · /creer  choisir · /creer/musee et /creer/filtre  éditeurs.
// Les anciennes (/?o=…, /visage, /affiches, /visage.html, /musee.html, /filtre.html,
// /affiche.html, /creer.html) redirigent.

// Modèles montrés sur l'accueil (section « Pour commencer »).
export const EXAMPLES = [
  { type: 'musee', search: 't=Affiches+myst%C3%A8res&o=esm3jjqrrj*Jtv-UW7Z9X51jcMP&o=rrqwss29bd*Jtv-UW7Z9X51jcMP' },
  { type: 'filtre', search: 't=Filtre+myst%C3%A8re&scene=IAYz8bpg0fXAopLM&p=mouth&s=0.4&y=0' },
]

export const MAX_ITEMS = 32   // affiches cherchées par le moteur 8th Wall
export const MAX_TRACKED = 4  // affiches suivies en même temps
// pl : affiche au mur (0, défaut) ou posée à plat sur une table / au sol (1) ; à plat, la scène
// est redressée pour se tenir debout au-dessus de l'image.
export const DEFAULTS = { s: 0.8, x: 0, y: 0, z: 0, ry: 0, pl: 0 }
const KEYS = ['s', 'x', 'y', 'z', 'ry', 'pl']

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
  if (items.length) return { title: p.get('t') || '', back: backUrl(p.get('r')), items: items.slice(0, MAX_ITEMS) }
  const num = (k) => { const v = parseFloat(p.get(k)); return Number.isFinite(v) ? v : DEFAULTS[k] }
  return {
    title: p.get('t') || '',
    back: backUrl(p.get('r')),
    items: [{
      target: p.get('target') || DEMO.target,
      scene: sceneRef(p.get('scene')) || DEMO.scene,
      s: num('s'), x: num('x'), y: num('y'), z: num('z'), ry: num('ry'), pl: num('pl'),
    }],
  }
}

export function playerLink(origin, { title, back, items }) {
  const p = new URLSearchParams()
  if (title) p.set('t', title)
  if (backUrl(back)) p.set('r', back.trim())
  items.forEach(i => p.append('o', encodeItem(i)))
  return `${origin}/musee?${p.toString()}`
}

export function galleryLink(origin, { title, items }) {
  const p = new URLSearchParams()
  if (title) p.set('t', title)
  items.forEach(i => p.append('a', i.target))
  return `${origin}/musee/affiches?${p.toString()}`
}

// Message d'erreur pour une URL de scène saisie, ou '' si elle est valide.
export function sceneIssue(value) {
  const v = (value || '').trim()
  if (!v) return 'Colle l\'URL de ta scène.'
  const ref = sceneRef(v)
  if (SCENE_ID_RE.test(ref)) return ''
  let u
  try { u = new URL(v) } catch { return 'Ce n\'est ni une URL ni un identifiant Spline.' }
  if (u.protocol !== 'https:') return 'L\'URL doit commencer par https://'
  if (/\.(glb|gltf)$/i.test(u.pathname)) return ''
  if (u.hostname.endsWith('spline.design')) {
    return 'Ce lien Spline n\'est pas le bon : utilise Export → Code et copie l\'URL qui finit par scene.splinecode.'
  }
  return 'L\'URL doit finir par scene.splinecode (Spline) ou .glb.'
}

// Lien de retour (paramètre r) : ex. le lien ProtoPie Cloud d'un prototype. Le bouton
// « Quitter » de l'AR y renvoie. Seules les URL https sont acceptées.
export function backUrl(value) {
  const v = (value || '').trim()
  if (!v) return ''
  try { return new URL(v).protocol === 'https:' ? v : '' } catch { return '' }
}

export function backIssue(value) {
  const v = (value || '').trim()
  if (!v) return ''
  return backUrl(v) ? '' : 'Le lien de retour doit être une URL complète en https://'
}
