// Museum editor: one or more posters → 8th Wall targets (built in the browser) → storage →
// one museum link + QR code. The collection lives in the link, not in a database.
import QRCode from 'qrcode'
import { readImage, buildTarget, defaultCrop, cropIssues, uploadTarget, UploadError, ImageIssueError } from './target-maker.js'
import { playerLink, galleryLink, readItems, sceneRef, sceneIssue, backIssue, posterUrl, ID_RE, DEFAULTS, MAX_ITEMS, MAX_TRACKED, TYPE_MUSEUM } from './shared.js'
import { startBackground } from './background.js'
import { mountNav } from './nav.js'
import { saveWork, getWork, findWorkBySearch, timeAgo } from './works.js'
import { mountWorksDrawer } from './works-ui.js'
import { initI18n, setText, translateDom, onLanguageChange } from './i18n.js'

startBackground(document.getElementById('bg-canvas'))
await initI18n()
mountNav()

const $ = id => document.getElementById(id)
const listEl = $('list'), tpl = $('art-tpl'), addBtn = $('add'), counterEl = $('counter')
const backIn = $('back')
const titleIn = $('title'), createBtn = $('create'), createMsg = $('create-msg')
const result = $('result'), linkIn = $('link'), qr = $('qr')
const KEYS = ['s', 'x', 'y', 'z', 'ry', 'pl']
const DRAFT_KEY = 'spline-ar-expo' // persisted key: do not rename

/** @type {{ el: HTMLElement, bitmap?: ImageBitmap, id?: string, scene: string, s, x, y, z, ry, pl }[]} */
let items = []
let linkReady = false
let workId = null // "My creations" entry open in the editor

// Message element: i18n key + params, styled as error / success.
const say = (el, key, kind = '', params) => {
  setText(el, key, params)
  el.className = `msg ${kind} ${el.dataset.base || ''}`.trim()
}

// ── One poster in the list ────────────────────────────────────────────────────
function addItem(data = {}) {
  if (items.length >= MAX_ITEMS) return
  const el = tpl.content.firstElementChild.cloneNode(true)
  translateDom(el)
  const item = { el, id: data.id, scene: data.scene || '', ...DEFAULTS }
  KEYS.forEach(k => { if (Number.isFinite(data[k])) item[k] = data[k] })
  items.push(item)
  listEl.appendChild(el)

  const q = sel => el.querySelector(sel)
  q('.file-msg').dataset.base = 'file-msg'
  q('.scene-msg').dataset.base = 'scene-msg'
  q('.scene').value = item.scene
  KEYS.forEach(k => { q(`[data-k=${k}]`).value = item[k] })
  if (item.id) showThumb(item, posterUrl(item.id), 'museum.editor.alreadyUploaded')
  if (KEYS.some(k => item[k] !== DEFAULTS[k])) q('details').open = true

  q('.file').onchange = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      item.bitmap = await readImage(file)
    } catch {
      say(q('.file-msg'), 'errors.image.unreadable', 'err'); return
    }
    item.id = undefined // new image → new upload
    const issues = cropIssues(defaultCrop(item.bitmap.width, item.bitmap.height))
    showThumb(item, thumbFromBitmap(item.bitmap), issues.length ? null : 'museum.editor.imageOk',
      { name: file.name, w: item.bitmap.width, h: item.bitmap.height })
    if (issues.length) say(q('.file-msg'), issues[0].key, 'err', issues[0].params)
    changed()
  }
  q('.scene').oninput = e => { item.scene = e.target.value; changed() }
  KEYS.forEach(k => {
    q(`[data-k=${k}]`)[k === 'pl' ? 'onchange' : 'oninput'] = e => { item[k] = parseFloat(e.target.value); changed() }
  })
  q('.remove').onclick = () => {
    items = items.filter(i => i !== item)
    el.remove()
    changed()
  }
  changed()
}

function showThumb(item, src, key, params) {
  const img = item.el.querySelector('.thumb')
  img.src = src; img.hidden = false
  if (key) say(item.el.querySelector('.file-msg'), key, 'ok', params)
}

function thumbFromBitmap(bitmap) {
  const c = document.createElement('canvas')
  const k = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height))
  c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k)
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.8)
}

function itemReady(item) {
  const imgOk = item.id || (item.bitmap && !cropIssues(defaultCrop(item.bitmap.width, item.bitmap.height)).length)
  return imgOk && !sceneIssue(item.scene)
}

// ── Global state ──────────────────────────────────────────────────────────────
function changed() {
  items.forEach((item, i) => {
    const q = sel => item.el.querySelector(sel)
    q('.art-num b').textContent = i + 1
    q('.remove').hidden = items.length === 1
    KEYS.forEach(k => { q(`[data-k=${k}]`).nextElementSibling.textContent = item[k] + (k === 'ry' ? '°' : '') })
    const issue = item.scene.trim() ? sceneIssue(item.scene) : ''
    say(q('.scene-msg'), issue, issue ? 'err' : '')
  })
  addBtn.disabled = items.length >= MAX_ITEMS
  setText(counterEl, items.length > 1 ? 'museum.editor.counter' : '', { n: items.length, max: MAX_ITEMS, tracked: MAX_TRACKED })
  const bIssue = backIssue(backIn.value)
  say($('back-msg'), bIssue, bIssue ? 'err' : '')
  const allOk = items.length > 0 && items.every(itemReady) && !bIssue
  createBtn.disabled = !allOk
  const pending = items.some(i => !i.id)
  setText(createBtn, linkReady && !pending ? 'editor.updateLink' : 'editor.createLink')
  if (linkReady && !pending && allOk) renderLink()
  else if (pending) result.classList.remove('visible')
  saveDraft()
}

function museum() {
  return {
    title: titleIn.value.trim(),
    back: backIssue(backIn.value) ? '' : backIn.value.trim(),
    items: items.map(i => ({ target: i.id, scene: sceneRef(i.scene), s: i.s, x: i.x, y: i.y, z: i.z, ry: i.ry, pl: i.pl })),
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      workId, title: titleIn.value, back: backIn.value,
      items: items.map(({ id, scene, s, x, y, z, ry, pl }) => ({ id, scene, s, x, y, z, ry, pl })),
    }))
  } catch {}
}

function restoreDraft() {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (!v?.items?.length) return false
    titleIn.value = v.title || ''
    backIn.value = v.back || ''
    if (v.workId && getWork(v.workId)) workId = v.workId
    v.items.forEach(addItem)
    return true
  } catch { return false }
}

async function renderLink() {
  const m = museum()
  const link = playerLink(location.origin, m)
  linkIn.value = link
  $('open').href = link
  $('gallery').href = galleryLink(location.origin, m)
  await QRCode.toCanvas(qr, link, { width: 220, margin: 1 })
  $('qr-dl').href = qr.toDataURL('image/png')
  result.classList.add('visible')
  remember(new URL(link).search)
}

// Every created or updated link is saved to "My creations".
function remember(search) {
  const id = saveWork({ id: workId, type: TYPE_MUSEUM, search })
  if (id !== workId) {
    workId = id
    window.dispatchEvent(new CustomEvent('works-changed')) // the drawer highlights the open creation
    history.replaceState(null, '', `?w=${encodeURIComponent(id)}`)
    saveDraft()
  }
  renderSavedState()
}
function renderSavedState() {
  const w = workId && getWork(workId)
  if (w) setText($('saved-state'), 'editor.savedState', { when: timeAgo(w.updatedAt) })
}
onLanguageChange(renderSavedState)

function uploadErrorKey(err) {
  if (err instanceof ImageIssueError) return err.issues[0].key
  if (err instanceof UploadError) return `errors.upload.${err.code}`
  return 'errors.upload.unknown'
}

createBtn.onclick = async () => {
  createBtn.disabled = true
  try {
    const todo = items.filter(i => !i.id)
    for (const [n, item] of todo.entries()) {
      if (todo.length > 1) say(createMsg, 'museum.editor.uploadingMany', '', { i: n + 1, n: todo.length })
      else say(createMsg, 'museum.editor.uploadingOne')
      const res = await uploadTarget(buildTarget(item.bitmap))
      item.id = res.id
      saveDraft()
    }
    linkReady = true
    await renderLink()
    say(createMsg, 'editor.ready', 'ok')
  } catch (err) {
    console.error('[SplineAR]', err)
    say(createMsg, uploadErrorKey(err), 'err', err.issues?.[0]?.params)
  } finally {
    changed()
  }
}

$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(linkIn.value); say(createMsg, 'editor.copied', 'ok') }
  catch { linkIn.select(); say(createMsg, 'editor.copyManually') }
}

// ── Edit an existing museum from its link ─────────────────────────────────────
// Loads a museum from its link's query string; returns the number of posters picked up.
function loadSearch(search) {
  const { title, back, items: defs } = readItems(search)
  const usable = defs.filter(d => ID_RE.test(d.target || ''))
  if (!usable.length) return 0
  items.forEach(i => i.el.remove())
  items = []
  titleIn.value = title
  backIn.value = back || ''
  usable.forEach(d => addItem({ id: d.target, scene: d.scene, s: d.s, x: d.x, y: d.y, z: d.z, ry: d.ry, pl: d.pl }))
  linkReady = true
  return usable.length
}

$('import-btn').onclick = () => {
  const msg = $('import-msg')
  let url
  try { url = new URL($('import').value.trim()) } catch { say(msg, 'errors.link.invalid', 'err'); return }
  workId = findWorkBySearch(TYPE_MUSEUM, url.search)?.id || null
  const n = loadSearch(url.search)
  if (!n) { say(msg, 'museum.editor.importNone', 'err'); return }
  changed()
  say(msg, n > 1 ? 'museum.editor.imported.other' : 'museum.editor.imported.one', 'ok', { n })
}

addBtn.onclick = () => { addItem(); items[items.length - 1].el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
titleIn.oninput = changed
backIn.oninput = changed

// Opening: ?w=<creation> | museum link (?o=… from "Edit" on the player) | ?nouveau=1 | draft.
// (`nouveau` = "new": persisted in published links from the home page, kept as is.)
const q = new URLSearchParams(location.search)
const fromWork = q.get('w') && getWork(q.get('w'))
if (fromWork) {
  workId = fromWork.id
  loadSearch('?' + fromWork.search)
} else if (q.has('o') || q.has('target')) {
  workId = findWorkBySearch(TYPE_MUSEUM, location.search)?.id || null
  if (!loadSearch(location.search)) addItem()
} else if (q.has('nouveau')) {
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
  history.replaceState(null, '', location.pathname)
  addItem()
} else if (restoreDraft()) {
  linkReady = items.every(i => i.id)
} else {
  addItem()
}
if (!items.length) addItem()
changed()
mountWorksDrawer({ currentId: () => workId })
