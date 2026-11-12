// "My creations": museums and filters saved in the student's browser.
//
// The share link is the single source of truth: a creation = its type + the query string of
// its link (?t=…&o=… for a museum, ?scene=…&p=… for a filter). Everything else (title, number
// of posters, thumbnail) is derived from it. Poster images are already stored on the server
// (Netlify Blobs) and referenced by id inside the link.
//
// No account: creations stay in this browser. The link itself is the backup: open it, then
// "Edit" picks the creation up again (on any device).

import { readItems, posterUrl, TYPE_MUSEUM, TYPE_FILTER } from './shared.js'
import { readFilter } from './filter-shared.js'
import { t, tn, getLanguage } from './i18n.js'

const STORAGE_KEY = 'spline-ar-creations' // persisted key: do not rename
export const TYPES = {
  [TYPE_MUSEUM]: { labelKey: 'types.museum', editor: '/creer/musee', player: '/musee' },
  [TYPE_FILTER]: { labelKey: 'types.filter', editor: '/creer/filtre', player: '/filtre' },
}

function read() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').filter(w => w && TYPES[w.type]) } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {}
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

// Creates or updates a creation; returns its id.
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

// Display info derived from the link (translated in the current language).
export function describe(work) {
  const search = '?' + norm(work.search)
  const type = TYPES[work.type]
  const link = `${location.origin}${type.player}${search}`
  const edit = `${type.editor}?w=${encodeURIComponent(work.id)}`
  if (work.type === TYPE_MUSEUM) {
    const { title, items } = readItems(search)
    return {
      title: title || t('works.untitledMuseum'),
      detail: tn('works.posterCount', items.length),
      thumb: posterUrl(items[0]?.target), link, edit,
    }
  }
  const f = readFilter(search)
  return { title: f.title || t('works.untitledFilter'), detail: '', thumb: null, link, edit }
}

export function timeAgo(ts) {
  const lang = getLanguage()
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return t('time.justNow')
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' })
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
  const d = Math.round(s / 86400)
  return d < 30 ? rtf.format(-d, 'day') : new Date(ts).toLocaleDateString(lang)
}

// Cross-tab sync (e.g. live tuning on /filtre → filter editor in another tab).
export function onWorksChanged(fn) {
  window.addEventListener('works-changed', fn)
  window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) fn() })
}
