// Page Créer un filtre visage : scène + point d'ancrage + réglages → lien + QR.
// Rien n'est envoyé au serveur : tout tient dans le lien.
import QRCode from 'qrcode'
import { sceneIssue } from './shared.js'
import { POINTS, FACE_DEFAULTS, EXPRESSIONS, filterLink, readFilter } from './face-shared.js'
import { startBackground } from './background.js'
import { saveWork, getWork, findWorkBySearch, onWorksChanged, timeAgo } from './works.js'
import { mountWorksDrawer } from './works-ui.js'
import './nav.js'

startBackground(document.getElementById('bg-canvas'))

const $ = id => document.getElementById(id)
const sceneIn = $('scene'), pointSel = $('p'), titleIn = $('title')
const createBtn = $('create'), createMsg = $('create-msg'), result = $('result')
const linkIn = $('link'), qr = $('qr')
const KEYS = ['s', 'x', 'y', 'z', 'ry']
const LS_KEY = 'spline-ar-filtre'
const sliders = Object.fromEntries(KEYS.map(k => [k, document.querySelector(`[data-k=${k}]`)]))
let linkReady = false
let workId = null // création « Mes créations » ouverte dans l'éditeur

const say = (el, text, kind = '') => { el.textContent = text; el.className = `msg ${kind}` }

POINTS.forEach(p => pointSel.add(new Option(p.label, p.id)))
EXPRESSIONS.forEach(e => {
  const code = document.createElement('code'); code.textContent = e.variable
  const label = document.createElement('span'); label.textContent = e.label
  $('expr').append(code, label)
})

function state() {
  return {
    title: titleIn.value.trim(), scene: sceneIn.value.trim(), p: pointSel.value,
    ...Object.fromEntries(KEYS.map(k => [k, parseFloat(sliders[k].value)])),
  }
}

function load(f) {
  titleIn.value = f.title || ''
  sceneIn.value = f.scene || ''
  pointSel.value = f.p || FACE_DEFAULTS.p
  KEYS.forEach(k => { sliders[k].value = Number.isFinite(f[k]) ? f[k] : FACE_DEFAULTS[k] })
}

async function renderLink() {
  const link = filterLink(location.origin, state())
  linkIn.value = link
  remember(new URL(link).search)
  // « Ouvrir » lance le filtre avec le panneau de réglage en direct, relié à cette création.
  $('open').href = `${link}&reglage=1&w=${encodeURIComponent(workId)}`
  await QRCode.toCanvas(qr, link, { width: 220, margin: 1 })
  $('qr-dl').href = qr.toDataURL('image/png')
  result.classList.add('visible')
}

function changed() {
  KEYS.forEach(k => { sliders[k].nextElementSibling.textContent = sliders[k].value + (k === 'ry' ? '°' : '') })
  const issue = sceneIssue(sceneIn.value)
  say($('scene-msg'), sceneIn.value.trim() ? issue : '', issue ? 'err' : '')
  createBtn.disabled = !!issue
  createBtn.textContent = linkReady ? 'Mettre à jour mon lien →' : 'Créer mon lien →'
  if (linkReady && !issue) renderLink()
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ...state(), linkReady, workId })) } catch {}
}

// Chaque lien créé ou mis à jour est enregistré dans « Mes créations ».
function remember(search) {
  const id = saveWork({ id: workId, type: 'filtre', search })
  if (id !== workId) {
    workId = id
    window.dispatchEvent(new CustomEvent('works-changed')) // le tiroir marque la création ouverte
    history.replaceState(null, '', `?w=${encodeURIComponent(id)}`)
  }
  $('saved-state').textContent = `✓ Enregistré dans Mes créations · ${timeAgo(getWork(id)?.updatedAt || Date.now())}`
}

createBtn.onclick = async () => {
  linkReady = true
  await renderLink()
  say(createMsg, 'C\'est prêt.', 'ok')
  changed()
}

$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(linkIn.value); say(createMsg, 'Lien copié.', 'ok') }
  catch { linkIn.select(); say(createMsg, 'Sélectionne le lien et copie-le.') }
}

// Ouverture : ?w=<création> | lien de filtre (?scene=… depuis « Modifier ») | ?nouveau=1 | brouillon.
const q = new URLSearchParams(location.search)
const fromWork = q.get('w') && getWork(q.get('w'))
let saved = null
try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null') } catch {}
if (fromWork) {
  workId = fromWork.id
  load(readFilter('?' + fromWork.search)); linkReady = true
} else if (q.has('scene')) {
  workId = findWorkBySearch('filtre', location.search)?.id || null
  load(readFilter(location.search)); linkReady = true
} else if (q.has('nouveau')) {
  history.replaceState(null, '', location.pathname)
  load(FACE_DEFAULTS)
} else if (saved) {
  if (saved.workId && getWork(saved.workId)) workId = saved.workId
  load(saved); linkReady = !!saved.linkReady
} else {
  load(FACE_DEFAULTS)
}

// Réglage en direct sur /filtre (autre onglet) → on recharge les valeurs ici.
onWorksChanged(() => {
  const w = workId && getWork(workId)
  if (!w) return
  const cur = new URL(filterLink(location.origin, state())).search.slice(1)
  if (w.search !== cur) { load(readFilter('?' + w.search)); changed(); say(createMsg, 'Réglages mis à jour depuis le filtre.', 'ok') }
})
mountWorksDrawer({ currentId: () => workId })

sceneIn.oninput = changed
titleIn.oninput = changed
pointSel.onchange = changed
KEYS.forEach(k => { sliders[k].oninput = changed })
changed()
