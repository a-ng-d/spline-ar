// Page Créer un filtre visage : scène + point d'ancrage + réglages → lien + QR.
// Rien n'est envoyé au serveur : tout tient dans le lien.
import QRCode from 'qrcode'
import { sceneIssue } from './shared.js'
import { POINTS, FACE_DEFAULTS, EXPRESSIONS, filterLink, readFilter } from './face-shared.js'
import { startBackground } from './background.js'

startBackground(document.getElementById('bg-canvas'))

const $ = id => document.getElementById(id)
const sceneIn = $('scene'), pointSel = $('p'), titleIn = $('title')
const createBtn = $('create'), createMsg = $('create-msg'), result = $('result')
const linkIn = $('link'), qr = $('qr')
const KEYS = ['s', 'x', 'y', 'z', 'ry']
const LS_KEY = 'spline-ar-filtre'
const sliders = Object.fromEntries(KEYS.map(k => [k, document.querySelector(`[data-k=${k}]`)]))
let linkReady = false

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
  $('open').href = link
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
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ...state(), linkReady })) } catch {}
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

// Ouvert depuis un lien de filtre (…/filtre.html?scene=…) : on reprend ses réglages.
const fromUrl = new URLSearchParams(location.search).has('scene') ? readFilter(location.search) : null
let saved = null
try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null') } catch {}
load(fromUrl || saved || FACE_DEFAULTS)
linkReady = !!(fromUrl || saved?.linkReady)

sceneIn.oninput = changed
titleIn.oninput = changed
pointSel.onchange = changed
KEYS.forEach(k => { sliders[k].oninput = changed })
changed()
