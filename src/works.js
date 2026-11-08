// « Mes créations » : musées et filtres enregistrés dans le navigateur de l'étudiant.
//
// Le lien de partage est la seule source de vérité : une création = son type + la query
// string de son lien (?t=…&o=… pour un musée, ?scene=…&p=… pour un filtre). Tout le reste
// (titre, nombre d'affiches, vignette) s'en déduit. Les images d'affiches, elles, sont déjà
// stockées sur le serveur (Netlify Blobs) et référencées par identifiant dans le lien.
//
// Pas de compte : les créations restent dans ce navigateur. Le lien lui-même sert de
// sauvegarde : le coller dans « Modifier » (ou ouvrir le lien puis « Modifier ») le reprend.

import { readItems, posterUrl } from './shared.js'
import { readFilter } from './face-shared.js'

const KEY = 'spline-ar-creations'
export const TYPES = {
  musee: { label: 'Musée', editor: '/musee.html', player: '/' },
  filtre: { label: 'Filtre visage', editor: '/filtre.html', player: '/visage.html' },
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]').filter(w => w && TYPES[w.type]) } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch {}
  window.dispatchEvent(new CustomEvent('works-changed'))
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const norm = search => (search || '').replace(/^\?/, '')

export function listWorks() {
  return read().sort((a, b) => b.updatedAt - a.updatedAt)
}
export function getWork(id) {
  return read().find(w => w.id === id) || null
}
export function findWorkBySearch(type, search) {
  const s = norm(search)
  return read().find(w => w.type === type && norm(w.search) === s) || null
}

// Crée ou met à jour ; renvoie l'identifiant.
export function saveWork({ id, type, search }) {
  const list = read()
  const now = Date.now()
  const existing = id && list.find(w => w.id === id)
  if (existing) {
    if (norm(existing.search) === norm(search)) return existing.id
    existing.search = norm(search)
    existing.updatedAt = now
  } else {
    id = newId()
    list.push({ id, type, search: norm(search), createdAt: now, updatedAt: now })
  }
  write(list)
  return id || existing.id
}

export function deleteWork(id) {
  write(read().filter(w => w.id !== id))
}

// Infos d'affichage déduites du lien.
export function describe(work) {
  const search = '?' + norm(work.search)
  const t = TYPES[work.type]
  const link = `${location.origin}${t.player}${search}`
  const edit = `${t.editor}?w=${encodeURIComponent(work.id)}`
  if (work.type === 'musee') {
    const { title, items } = readItems(search)
    return { title: title || 'Musée sans titre', detail: `${items.length} affiche${items.length > 1 ? 's' : ''}`,
      thumb: posterUrl(items[0]?.target), link, edit }
  }
  const f = readFilter(search)
  return { title: f.title || 'Filtre sans titre', detail: 'Filtre visage', thumb: null, link, edit }
}

export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'à l\'instant'
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`
  const d = Math.round(s / 86400)
  return d < 30 ? `il y a ${d} j` : new Date(ts).toLocaleDateString('fr-FR')
}

// Synchronisation entre onglets (ex. réglage en direct sur visage.html → éditeur filtre).
export function onWorksChanged(fn) {
  window.addEventListener('works-changed', fn)
  window.addEventListener('storage', e => { if (e.key === KEY) fn() })
}
