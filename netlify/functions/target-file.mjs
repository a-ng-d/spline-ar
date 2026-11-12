// GET /c/:id/:file — serves the files of an image target (target.json, luminance.jpg, affiche.jpg).
import { getStore } from '@netlify/blobs'

const FILES = {
  'target.json': 'application/json; charset=utf-8',
  'luminance.jpg': 'image/jpeg',
  'affiche.jpg': 'image/jpeg', // poster image (persisted name)
}

export default async (req, context) => {
  const { id, file } = context.params
  const type = FILES[file]
  if (!/^[a-z0-9]{6,24}$/.test(id || '') || !type) return new Response('Not found', { status: 404 })

  const data = await getStore('cibles').get(`${id}/${file}`, { type: 'arrayBuffer' })
  if (!data) return new Response('Not found', { status: 404 })

  return new Response(data, {
    headers: {
      'content-type': type,
      // A target never changes: a new upload creates a new id.
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
    },
  })
}

export const config = { path: '/c/:id/:file' }
