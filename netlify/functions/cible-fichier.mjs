// GET /c/:id/:fichier — sert les fichiers d'une cible (target.json, luminance.jpg, affiche.jpg).
import { getStore } from '@netlify/blobs'

const FILES = {
  'target.json': 'application/json; charset=utf-8',
  'luminance.jpg': 'image/jpeg',
  'affiche.jpg': 'image/jpeg',
}

export default async (req, context) => {
  const { id, fichier } = context.params
  const type = FILES[fichier]
  if (!/^[a-z0-9]{6,24}$/.test(id || '') || !type) return new Response('Introuvable', { status: 404 })

  const data = await getStore('cibles').get(`${id}/${fichier}`, { type: 'arrayBuffer' })
  if (!data) return new Response('Introuvable', { status: 404 })

  return new Response(data, {
    headers: {
      'content-type': type,
      // Une cible ne change jamais : un nouvel envoi crée un nouvel identifiant.
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
    },
  })
}

export const config = { path: '/c/:id/:fichier' }
