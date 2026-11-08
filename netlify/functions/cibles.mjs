// POST /api/cibles — enregistre une cible créée dans le navigateur (page Créer).
// Corps JSON : { properties, luminance, affiche }  (images en data URL JPEG)
// Réponse     : { id, target, affiche }
import { getStore } from '@netlify/blobs'

const MAX_LUMINANCE = 400 * 1024   // octets, après décodage
const MAX_AFFICHE = 3 * 1024 * 1024

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8' },
})

function decodeJpeg(dataUrl, max) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '')
  if (!m) throw new Error('image JPEG attendue')
  const bytes = Buffer.from(m[1], 'base64')
  if (bytes.length > max) throw new Error('image trop lourde')
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('JPEG invalide')
  return bytes
}

function checkProperties(p) {
  const keys = ['left', 'top', 'width', 'height', 'originalWidth', 'originalHeight']
  if (!p || typeof p !== 'object') throw new Error('propriétés manquantes')
  for (const k of keys) {
    if (!Number.isInteger(p[k]) || p[k] < 0 || p[k] > 20000) throw new Error(`propriété ${k} invalide`)
  }
  if (p.width < 480 || p.height < 640) throw new Error('image trop petite (480 × 640 minimum)')
  return {
    left: p.left, top: p.top, width: p.width, height: p.height,
    isRotated: !!p.isRotated, originalWidth: p.originalWidth, originalHeight: p.originalHeight,
  }
}

function newId() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, b => abc[b % abc.length]).join('')
}

export default async req => {
  if (req.method !== 'POST') return json({ error: 'méthode non autorisée' }, 405)
  let body
  try { body = await req.json() } catch { return json({ error: 'JSON invalide' }, 400) }

  let properties, luminance, affiche
  try {
    properties = checkProperties(body.properties)
    luminance = decodeJpeg(body.luminance, MAX_LUMINANCE)
    affiche = decodeJpeg(body.affiche, MAX_AFFICHE)
  } catch (err) {
    return json({ error: err.message }, 400)
  }

  const id = newId()
  const now = Date.now()
  // Même format que la CLI 8th Wall ; l'image de luminance est résolue à côté du JSON.
  const target = {
    imagePath: `${id}/luminance.jpg`,
    metadata: null,
    name: `affiche-${id}`,
    type: 'PLANAR',
    properties,
    resources: { luminanceImage: 'luminance.jpg', originalImage: 'affiche.jpg' },
    created: now,
    updated: now,
  }

  const store = getStore('cibles')
  await store.set(`${id}/luminance.jpg`, luminance, { metadata: { type: 'image/jpeg' } })
  await store.set(`${id}/affiche.jpg`, affiche, { metadata: { type: 'image/jpeg' } })
  await store.setJSON(`${id}/target.json`, target)

  return json({ id, target: `/c/${id}/target.json`, affiche: `/c/${id}/affiche.jpg` }, 201)
}

export const config = { path: '/api/cibles' }
