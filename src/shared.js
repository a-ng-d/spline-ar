// Utilitaires communs au player, à la page Créer et à la page Affiche.

// Identifiant court créé par la page Créer (stocké sur Netlify Blobs).
export const ID_RE = /^[a-z0-9]{6,24}$/

// "abc123" → "/c/abc123/target.json" ; une URL est laissée telle quelle.
export function targetUrl(value) {
  if (!value) return null
  return ID_RE.test(value) ? `/c/${value}/target.json` : value
}

export function posterUrl(value) {
  if (!value) return '/demo/affiche-demo.jpg'
  return ID_RE.test(value) ? `/c/${value}/affiche.jpg` : value
}

// Lien du player à partir des réglages ; les valeurs par défaut sont omises.
export function playerLink(origin, { scene, target, s, x, y, z, ry }) {
  const p = new URLSearchParams()
  if (scene) p.set('scene', scene)
  if (target) p.set('target', target)
  const add = (k, v, d) => { if (Number.isFinite(v) && v !== d) p.set(k, String(+v.toFixed(3))) }
  add('s', s, 0.8); add('x', x, 0); add('y', y, 0); add('z', z, 0); add('ry', ry, 0)
  return `${origin}/?${p.toString()}`
}
