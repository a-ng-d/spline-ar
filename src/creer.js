// Page Créer : affiche → cible 8th Wall (dans le navigateur) → stockage → lien + QR.
import QRCode from 'qrcode'
import { readImage, buildTarget, defaultCrop, cropIssues, keptRect, uploadTarget } from './target-maker.js'
import { playerLink } from './shared.js'

const $ = id => document.getElementById(id)
const fileIn = $('file'), preview = $('preview'), fileMsg = $('file-msg')
const sceneIn = $('scene'), sceneMsg = $('scene-msg')
const createBtn = $('create'), createMsg = $('create-msg')
const result = $('result'), linkIn = $('link'), qr = $('qr')
const SLIDERS = ['s', 'x', 'y', 'z', 'ry']
const LS_KEY = 'spline-ar-creer'

let bitmap = null
let uploaded = null // { id } — réutilisé tant que l'image ne change pas

const say = (el, text, kind = '') => { el.textContent = text; el.className = `msg ${kind}` }

// ── Réglages ──────────────────────────────────────────────────────────────────
function settings() {
  const v = Object.fromEntries(SLIDERS.map(k => [k, parseFloat($(k).value)]))
  return { ...v, scene: sceneIn.value.trim() }
}
function showValues() {
  SLIDERS.forEach(k => { document.querySelector(`output[for=${k}]`).textContent = $(k).value + (k === 'ry' ? '°' : '') })
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ...settings(), id: uploaded?.id })) } catch {}
}
function restore() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (v.scene) sceneIn.value = v.scene
    SLIDERS.forEach(k => { if (Number.isFinite(v[k])) $(k).value = v[k] })
  } catch {}
}

// ── Scène ─────────────────────────────────────────────────────────────────────
function sceneIssue(url) {
  if (!url) return 'Colle l\'URL de ta scène.'
  let u
  try { u = new URL(url) } catch { return 'Ce n\'est pas une URL valide.' }
  if (u.protocol !== 'https:') return 'L\'URL doit commencer par https://'
  if (/\.(glb|gltf)$/i.test(u.pathname)) return ''
  if (u.hostname === 'prod.spline.design' && u.pathname.endsWith('.splinecode')) return ''
  if (u.hostname.endsWith('spline.design')) {
    return 'Ce lien Spline n\'est pas le bon : utilise Export → Code et copie l\'URL qui finit par scene.splinecode.'
  }
  return 'L\'URL doit finir par scene.splinecode (Spline) ou .glb.'
}

// ── Affiche ───────────────────────────────────────────────────────────────────
function drawPreview() {
  const c = document.createElement('canvas')
  const k = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height))
  c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k)
  const ctx = c.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, c.width, c.height)
  const r = keptRect(bitmap)
  ctx.fillStyle = 'rgba(10,10,15,.65)'
  ctx.beginPath()
  ctx.rect(0, 0, c.width, c.height)
  ctx.rect(r.x * k, r.y * k, r.w * k, r.h * k)
  ctx.fill('evenodd')
  ctx.strokeStyle = '#fabe28'; ctx.lineWidth = 3
  ctx.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k)
  preview.src = c.toDataURL('image/jpeg', 0.85)
  preview.hidden = false
}

fileIn.onchange = async () => {
  const file = fileIn.files?.[0]
  uploaded = null
  result.classList.remove('visible')
  if (!file) { bitmap = null; update(); return }
  try {
    bitmap = await readImage(file)
  } catch {
    bitmap = null; preview.hidden = true
    say(fileMsg, 'Impossible de lire cette image.', 'err'); update(); return
  }
  drawPreview()
  const issues = cropIssues(defaultCrop(bitmap.width, bitmap.height))
  if (issues.length) say(fileMsg, issues.join(' '), 'err')
  else say(fileMsg, `${bitmap.width} × ${bitmap.height} px — ok.`, 'ok')
  update()
}

// ── État du bouton et du lien ─────────────────────────────────────────────────
function update() {
  showValues()
  const sIssue = sceneIssue(sceneIn.value.trim())
  say(sceneMsg, sceneIn.value.trim() ? sIssue : '', sIssue ? 'err' : '')
  const imgOk = bitmap && !cropIssues(defaultCrop(bitmap.width, bitmap.height)).length
  createBtn.disabled = !(imgOk && !sIssue)
  createBtn.textContent = uploaded ? 'Mettre à jour mon lien' : 'Créer mon lien'
  if (uploaded) renderLink()
  save()
}

async function renderLink() {
  const link = playerLink(location.origin, { ...settings(), target: uploaded.id })
  linkIn.value = link
  $('open').href = link
  $('poster').href = `/affiche.html?target=${uploaded.id}`
  await QRCode.toCanvas(qr, link, { width: 220, margin: 1 })
  $('qr-dl').href = qr.toDataURL('image/png')
  result.classList.add('visible')
}

createBtn.onclick = async () => {
  createBtn.disabled = true
  try {
    if (!uploaded) {
      say(createMsg, 'Préparation de l\'affiche…')
      const t = buildTarget(bitmap)
      say(createMsg, 'Envoi…')
      uploaded = await uploadTarget(t)
    }
    await renderLink()
    say(createMsg, 'C\'est prêt.', 'ok')
  } catch (err) {
    say(createMsg, `Échec : ${err.message}`, 'err')
  } finally {
    update()
  }
}

$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(linkIn.value); say(createMsg, 'Lien copié.', 'ok') }
  catch { linkIn.select(); say(createMsg, 'Sélectionne le lien et copie-le.', '') }
}

SLIDERS.forEach(k => { $(k).oninput = update })
sceneIn.oninput = update
restore()
update()
