// Filtre visage : format du lien et points d'ancrage, communs au player et au créateur.
//
//   /filtre?scene=<id Spline ou URL .glb>&p=<point>&s=…&x=…&y=…&z=…&ry=…&t=<titre>
//   s, x, y, z en largeur de visage ; ry en degrés.

import { sceneRef } from './shared.js'

// Points proposés aux étudiants (noms du moteur 8th Wall, sauf « face » = centre du visage).
export const POINTS = [
  { id: 'forehead', label: 'Front (chapeau, couronne, cornes)' },
  { id: 'noseBridge', label: 'Haut du nez (lunettes, masque)' },
  { id: 'noseTip', label: 'Bout du nez' },
  { id: 'mouth', label: 'Bouche' },
  { id: 'chin', label: 'Menton (barbe)' },
  { id: 'leftEar', label: 'Oreille gauche' },
  { id: 'rightEar', label: 'Oreille droite' },
  { id: 'face', label: 'Centre du visage' },
]
export const FACE_DEFAULTS = { p: 'forehead', s: 1, x: 0, y: 0.15, z: 0, ry: 0 }
const NUMS = ['s', 'x', 'y', 'z', 'ry']

// Expressions transmises à la scène Spline, si elle déclare une variable booléenne de ce nom.
export const EXPRESSIONS = [
  { variable: 'bouche', label: 'bouche ouverte', key: 'mouthOpen' },
  { variable: 'clinGauche', label: 'œil gauche fermé', key: 'leftEyeClosed' },
  { variable: 'clinDroit', label: 'œil droit fermé', key: 'rightEyeClosed' },
  { variable: 'sourcils', label: 'sourcils levés', key: 'eyebrowsRaised' },
]

export function readFilter(search) {
  const q = new URLSearchParams(search)
  const f = { title: q.get('t') || '', scene: sceneRef(q.get('scene')), ...FACE_DEFAULTS }
  if (POINTS.some(pt => pt.id === q.get('p'))) f.p = q.get('p')
  NUMS.forEach(k => { const v = parseFloat(q.get(k)); if (Number.isFinite(v)) f[k] = v })
  return f
}

export function filterLink(origin, f) {
  const q = new URLSearchParams()
  if (f.title) q.set('t', f.title)
  q.set('scene', sceneRef(f.scene))
  if (f.p !== FACE_DEFAULTS.p) q.set('p', f.p)
  NUMS.forEach(k => { if (Number.isFinite(f[k]) && f[k] !== FACE_DEFAULTS[k]) q.set(k, String(+f[k].toFixed(3))) })
  return `${origin}/filtre?${q.toString()}`
}
