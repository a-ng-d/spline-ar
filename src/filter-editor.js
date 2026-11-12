// Face filter editor: scene + anchor point + settings → link + QR code.
// Nothing is sent to the server: everything fits in the link.
import QRCode from 'qrcode'
import { sceneIssue, backIssue, TYPE_FILTER } from './shared.js'
import { POINTS, FACE_DEFAULTS, EXPRESSIONS, filterLink, readFilter } from './filter-shared.js'
import { startBackground } from './background.js'
import { saveWork, getWork, findWorkBySearch, onWorksChanged, timeAgo } from './works.js'
import { mountWorksDrawer } from './works-ui.js'
import { mountNav } from './nav.js'
import { initI18n, t, setText, onLanguageChange } from './i18n.js'

startBackground(document.getElementById('bg-canvas'))
await initI18n()
mountNav()

const $ = id => document.getElementById(id)
const sceneIn = $('scene'), pointSel = $('p'), titleIn = $('title'), backIn = $('back')
const createBtn = $('create'), createMsg = $('create-msg'), result = $('result')
const linkIn = $('link'), qr = $('qr')
const KEYS = ['s', 'x', 'y', 'z', 'ry']
const DRAFT_KEY = 'spline-ar-filtre' // persisted key: do not rename
const sliders = Object.fromEntries(KEYS.map(k => [k, document.querySelector(`[data-k=${k}]`)]))
let linkReady = false
let workId = null // "My creations" entry open in the editor

const say = (el, key, kind = '', params) => { setText(el, key, params); el.className = `msg ${kind}` }

// Anchor points (option labels re-translated on language change).
function fillPoints() {
  const current = pointSel.value || FACE_DEFAULTS.p
  pointSel.replaceChildren(...POINTS.map(p => new Option(t(p.labelKey), p.id)))
  pointSel.value = current
}
fillPoints()
onLanguageChange(fillPoints)

// Expressions: both accepted variable names + what triggers them.
EXPRESSIONS.forEach(e => {
  const code = document.createElement('code'); code.textContent = e.variables.join(' / ')
  const label = document.createElement('span'); setText(label, e.labelKey)
  $('expr').append(code, label)
})

function state() {
  return {
    title: titleIn.value.trim(), back: backIssue(backIn.value) ? '' : backIn.value.trim(),
    scene: sceneIn.value.trim(), p: pointSel.value,
    ...Object.fromEntries(KEYS.map(k => [k, parseFloat(sliders[k].value)])),
  }
}

function load(f) {
  titleIn.value = f.title || ''
  backIn.value = f.back || ''
  sceneIn.value = f.scene || ''
  pointSel.value = f.p || FACE_DEFAULTS.p
  KEYS.forEach(k => { sliders[k].value = Number.isFinite(f[k]) ? f[k] : FACE_DEFAULTS[k] })
}

async function renderLink() {
  const link = filterLink(location.origin, state())
  linkIn.value = link
  remember(new URL(link).search)
  // "Open" starts the filter with the live tuning panel, linked to this creation.
  $('open').href = `${link}&reglage=1&w=${encodeURIComponent(workId)}`
  await QRCode.toCanvas(qr, link, { width: 220, margin: 1 })
  $('qr-dl').href = qr.toDataURL('image/png')
  result.classList.add('visible')
}

function changed() {
  KEYS.forEach(k => { sliders[k].nextElementSibling.textContent = sliders[k].value + (k === 'ry' ? '°' : '') })
  const issue = sceneIssue(sceneIn.value)
  say($('scene-msg'), sceneIn.value.trim() ? issue : '', issue ? 'err' : '')
  const bIssue = backIssue(backIn.value)
  say($('back-msg'), bIssue, bIssue ? 'err' : '')
  createBtn.disabled = !!issue || !!bIssue
  setText(createBtn, linkReady ? 'editor.updateLink' : 'editor.createLink')
  if (linkReady && !issue) renderLink()
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...state(), linkReady, workId })) } catch {}
}

// Every created or updated link is saved to "My creations".
function remember(search) {
  const id = saveWork({ id: workId, type: TYPE_FILTER, search })
  if (id !== workId) {
    workId = id
    window.dispatchEvent(new CustomEvent('works-changed')) // the drawer highlights the open creation
    history.replaceState(null, '', `?w=${encodeURIComponent(id)}`)
  }
  renderSavedState()
}
function renderSavedState() {
  const w = workId && getWork(workId)
  if (w) setText($('saved-state'), 'editor.savedState', { when: timeAgo(w.updatedAt) })
}
onLanguageChange(renderSavedState)

createBtn.onclick = async () => {
  linkReady = true
  await renderLink()
  say(createMsg, 'editor.ready', 'ok')
  changed()
}

$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(linkIn.value); say(createMsg, 'editor.copied', 'ok') }
  catch { linkIn.select(); say(createMsg, 'editor.copyManually') }
}

// Opening: ?w=<creation> | filter link (?scene=… from "Edit") | ?nouveau=1 | draft.
const q = new URLSearchParams(location.search)
const fromWork = q.get('w') && getWork(q.get('w'))
let draft = null
try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') } catch {}
if (fromWork) {
  workId = fromWork.id
  load(readFilter('?' + fromWork.search)); linkReady = true
} else if (q.has('scene')) {
  workId = findWorkBySearch(TYPE_FILTER, location.search)?.id || null
  load(readFilter(location.search)); linkReady = true
} else if (q.has('nouveau')) {
  history.replaceState(null, '', location.pathname)
  load(FACE_DEFAULTS)
} else if (draft) {
  if (draft.workId && getWork(draft.workId)) workId = draft.workId
  load(draft); linkReady = !!draft.linkReady
} else {
  load(FACE_DEFAULTS)
}

// Live tuning on /filtre (other tab) → reload the values here.
onWorksChanged(() => {
  const w = workId && getWork(workId)
  if (!w) return
  const cur = new URL(filterLink(location.origin, state())).search.slice(1)
  if (w.search !== cur) { load(readFilter('?' + w.search)); changed(); say(createMsg, 'filter.editor.syncedFromFilter', 'ok') }
})
mountWorksDrawer({ currentId: () => workId })

sceneIn.oninput = changed
titleIn.oninput = changed
backIn.oninput = changed
pointSel.onchange = changed
KEYS.forEach(k => { sliders[k].oninput = changed })
changed()
