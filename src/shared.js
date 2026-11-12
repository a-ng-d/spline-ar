// Shared helpers for the museum player, the editors and the poster gallery.
//
// Museum link format (no database for the collection: the link *is* the record):
//   /musee?o=<target>*<scene>*<s>*<x>*<y>*<z>*<ry>*<pl>&o=…&t=<title>&r=<back url>
//   - one artwork per `o` parameter (up to MAX_ITEMS)
//   - <target>  poster id created in the editor (or the URL of a target JSON, encoded)
//   - <scene>   Spline scene id (prod.spline.design/<id>/scene.splinecode) or an encoded .glb URL
//   - trailing settings are omitted when they equal their default
//   - t  optional title · r  optional "back" link (the Quit button of the AR), e.g. a ProtoPie prototype
// Legacy single-poster links ?scene=…&target=…&s=… are still read.
//
// Routes (kept in French: they are part of published links):
//   /                  home              /musee            play a museum
//   /musee/affiches    posters to aim at /filtre           play a face filter
//   /creer             choose            /creer/musee      museum editor
//   /creer/filtre      filter editor
// Former addresses redirect (see public/_redirects).

// Creation types, as stored in links and in the browser ("My creations"). The French values
// are persisted data: do not rename them.
export const TYPE_MUSEUM = 'musee'
export const TYPE_FILTER = 'filtre'

// Templates shown on the home page ("Get started"). The title is added per language.
export const TEMPLATES = [
  { type: TYPE_MUSEUM, titleKey: 'templates.museum.title',
    search: 'o=esm3jjqrrj*Jtv-UW7Z9X51jcMP&o=rrqwss29bd*Jtv-UW7Z9X51jcMP' },
  { type: TYPE_FILTER, titleKey: 'templates.filter.title',
    search: 'scene=IAYz8bpg0fXAopLM&p=mouth&s=0.4&y=0' },
]

export const MAX_ITEMS = 32   // posters searched by the 8th Wall engine
export const MAX_TRACKED = 4  // posters tracked at the same time
// pl: poster on a wall (0, default) or lying flat on a table / the floor (1). When flat, the
// scene is stood up so that it rises above the image.
export const DEFAULTS = { s: 0.8, x: 0, y: 0, z: 0, ry: 0, pl: 0 }
const KEYS = ['s', 'x', 'y', 'z', 'ry', 'pl']

// Poster id created by the editor (stored on Netlify Blobs).
export const ID_RE = /^[a-z0-9]{6,24}$/
// Spline scene id (same rule as SplineXR).
export const SCENE_ID_RE = /^[A-Za-z0-9_-]{6,64}$/

export const DEMO = {
  target: '/image-targets/demo-poster.json',
  poster: '/demo/demo-poster.jpg',
  scene: 'h7gKpO9w4utya2UU',
}

// "abc123" → "/c/abc123/target.json"; a URL is returned unchanged.
export function targetUrl(value) {
  if (!value) return null
  return ID_RE.test(value) ? `/c/${value}/target.json` : value
}

export function posterUrl(value) {
  if (!value) return DEMO.poster
  return ID_RE.test(value) ? `/c/${value}/affiche.jpg` : value
}

// Accepts a Spline prod URL, a bare id, or a .glb/.gltf URL.
// Returns a short reference: the Spline id, or the full GLB URL.
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

// Reads the artworks of a museum link (current `o=` format, or the legacy single-poster one).
export function readItems(search) {
  const p = new URLSearchParams(search)
  const items = p.getAll('o').filter(Boolean).map(decodeItem).filter(i => i.target && i.scene)
  if (items.length) return { title: p.get('t') || '', back: backUrl(p.get('r')), items: items.slice(0, MAX_ITEMS) }
  const num = k => { const v = parseFloat(p.get(k)); return Number.isFinite(v) ? v : DEFAULTS[k] }
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

// Validation of a scene URL typed by the user: returns an i18n key, or '' when valid.
export function sceneIssue(value) {
  const v = (value || '').trim()
  if (!v) return 'errors.scene.empty'
  if (SCENE_ID_RE.test(sceneRef(v))) return ''
  let u
  try { u = new URL(v) } catch { return 'errors.scene.invalid' }
  if (u.protocol !== 'https:') return 'errors.scene.https'
  if (/\.(glb|gltf)$/i.test(u.pathname)) return ''
  if (u.hostname.endsWith('spline.design')) return 'errors.scene.wrongSplineLink'
  return 'errors.scene.extension'
}

// "Back" link (parameter r): e.g. a ProtoPie Cloud prototype. The AR Quit button goes there.
// Only https URLs are accepted.
export function backUrl(value) {
  const v = (value || '').trim()
  if (!v) return ''
  try { return new URL(v).protocol === 'https:' ? v : '' } catch { return '' }
}

// Returns an i18n key, or '' when valid (or empty: the field is optional).
export function backIssue(value) {
  const v = (value || '').trim()
  if (!v) return ''
  return backUrl(v) ? '' : 'errors.back.https'
}
