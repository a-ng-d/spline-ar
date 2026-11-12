// POST /api/cibles — stores an image target built in the browser (museum editor).
// JSON body: { properties, luminance, poster }   (images as JPEG data URLs)
// Response:  { id, target, poster }
// Errors:    { code } with code ∈ method, json, jpeg, too_heavy, bad_jpeg, properties, too_small
//            (translated client-side as errors.upload.<code>).
//
// The route (/api/cibles), the Blobs store name ("cibles") and the stored file names are part
// of published data and links: do not rename them.
import { getStore } from '@netlify/blobs'

const MAX_LUMINANCE = 400 * 1024 // bytes, after decoding
const MAX_POSTER = 3 * 1024 * 1024

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8' },
})

class InputError extends Error {
  constructor(code) { super(code); this.code = code }
}

function decodeJpeg(dataUrl, max) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '')
  if (!m) throw new InputError('jpeg')
  const bytes = Buffer.from(m[1], 'base64')
  if (bytes.length > max) throw new InputError('too_heavy')
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new InputError('bad_jpeg')
  return bytes
}

function checkProperties(p) {
  const keys = ['left', 'top', 'width', 'height', 'originalWidth', 'originalHeight']
  if (!p || typeof p !== 'object') throw new InputError('properties')
  for (const k of keys) {
    if (!Number.isInteger(p[k]) || p[k] < 0 || p[k] > 20000) throw new InputError('properties')
  }
  if (p.width < 480 || p.height < 640) throw new InputError('too_small')
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
  if (req.method !== 'POST') return json({ code: 'method' }, 405)
  let body
  try { body = await req.json() } catch { return json({ code: 'json' }, 400) }

  let properties, luminance, poster
  try {
    properties = checkProperties(body.properties)
    luminance = decodeJpeg(body.luminance, MAX_LUMINANCE)
    // `affiche` is the field name used before v0.4.
    poster = decodeJpeg(body.poster ?? body.affiche, MAX_POSTER)
  } catch (err) {
    return json({ code: err.code || 'unknown' }, 400)
  }

  const id = newId()
  const now = Date.now()
  // Same format as the 8th Wall CLI; the luminance image is resolved next to the JSON.
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
  await store.set(`${id}/affiche.jpg`, poster, { metadata: { type: 'image/jpeg' } })
  await store.setJSON(`${id}/target.json`, target)

  return json({ id, target: `/c/${id}/target.json`, poster: `/c/${id}/affiche.jpg` }, 201)
}

export const config = { path: '/api/cibles' }
