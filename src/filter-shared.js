// Face filter: link format, anchor points and expressions, shared by the player and the editor.
//
//   /filtre?scene=<Spline id or .glb URL>&p=<point>&s=…&x=…&y=…&z=…&ry=…&t=<title>&r=<back url>
//   s, x, y, z are in face widths; ry in degrees; r is an optional "back" link.

import { sceneRef, backUrl } from './shared.js'

// Anchor points offered to students (8th Wall engine names, except "face" = centre of the face).
// Labels are i18n keys.
export const POINTS = [
  { id: 'forehead', labelKey: 'filter.point.forehead' },
  { id: 'noseBridge', labelKey: 'filter.point.noseBridge' },
  { id: 'noseTip', labelKey: 'filter.point.noseTip' },
  { id: 'mouth', labelKey: 'filter.point.mouth' },
  { id: 'chin', labelKey: 'filter.point.chin' },
  { id: 'leftEar', labelKey: 'filter.point.leftEar' },
  { id: 'rightEar', labelKey: 'filter.point.rightEar' },
  { id: 'face', labelKey: 'filter.point.face' },
]
export const FACE_DEFAULTS = { p: 'forehead', s: 1, x: 0, y: 0.15, z: 0, ry: 0 }
const NUMS = ['s', 'x', 'y', 'z', 'ry']

// Expressions sent to the Spline scene as boolean variables, when the scene declares one of
// these names. Each expression accepts an English and a French variable name, so students can
// name their variables in either language.
export const EXPRESSIONS = [
  { key: 'mouthOpen', variables: ['mouthOpen', 'bouche'], labelKey: 'filter.expression.mouthOpen' },
  { key: 'leftEyeClosed', variables: ['leftEyeClosed', 'clinGauche'], labelKey: 'filter.expression.leftEyeClosed' },
  { key: 'rightEyeClosed', variables: ['rightEyeClosed', 'clinDroit'], labelKey: 'filter.expression.rightEyeClosed' },
  { key: 'eyebrowsRaised', variables: ['eyebrowsRaised', 'sourcils'], labelKey: 'filter.expression.eyebrowsRaised' },
]

export function readFilter(search) {
  const q = new URLSearchParams(search)
  const f = { title: q.get('t') || '', back: backUrl(q.get('r')), scene: sceneRef(q.get('scene')), ...FACE_DEFAULTS }
  if (POINTS.some(pt => pt.id === q.get('p'))) f.p = q.get('p')
  NUMS.forEach(k => { const v = parseFloat(q.get(k)); if (Number.isFinite(v)) f[k] = v })
  return f
}

export function filterLink(origin, f) {
  const q = new URLSearchParams()
  if (f.title) q.set('t', f.title)
  if (backUrl(f.back)) q.set('r', f.back.trim())
  q.set('scene', sceneRef(f.scene))
  if (f.p !== FACE_DEFAULTS.p) q.set('p', f.p)
  NUMS.forEach(k => { if (Number.isFinite(f[k]) && f[k] !== FACE_DEFAULTS[k]) q.set(k, String(+f[k].toFixed(3))) })
  return `${origin}/filtre?${q.toString()}`
}
