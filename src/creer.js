// Page Créer : une ou plusieurs affiches → cibles 8th Wall (dans le navigateur) →
// stockage → un lien « expo » + QR. La collection vit dans le lien, pas en base.
import QRCode from 'qrcode'
import { readImage, buildTarget, defaultCrop, cropIssues, uploadTarget } from './target-maker.js'
import { playerLink, galleryLink, readItems, sceneRef, posterUrl, ID_RE, SCENE_ID_RE, DEFAULTS, MAX_ITEMS } from './shared.js'
import { startBackground } from './background.js'

startBackground(document.getElementById('bg-canvas'))

const $ = id => document.getElementById(id)
const listEl = $('list'), tpl = $('art-tpl'), addBtn = $('add'), counterEl = $('counter')
const titleIn = $('title'), createBtn = $('create'), createMsg = $('create-msg')
const result = $('result'), linkIn = $('link'), qr = $('qr')
const KEYS = ['s', 'x', 'y', 'z', 'ry']
const LS_KEY = 'spline-ar-expo'

/** @type {{ el: HTMLElement, bitmap?: ImageBitmap, id?: string, scene: string, s, x, y, z, ry }[]} */
let items = []
let linkReady = false

const say = (el, text, kind = '') => { el.textContent = text; el.className = `msg ${kind} ${el.dataset.base || ''}`.trim() }

// ── Scène ─────────────────────────────────────────────────────────────────────
function sceneIssue(value) {
  const v = (value || '').trim()
  if (!v) return 'Colle l\'URL de ta scène.'
  const ref = sceneRef(v)
  if (SCENE_ID_RE.test(ref)) return ''
  let u
  try { u = new URL(v) } catch { return 'Ce n\'est ni une URL ni un identifiant Spline.' }
  if (u.protocol !== 'https:') return 'L\'URL doit commencer par https://'
  if (/\.(glb|gltf)$/i.test(u.pathname)) return ''
  if (u.hostname.endsWith('spline.design')) {
    return 'Ce lien Spline n\'est pas le bon : utilise Export → Code et copie l\'URL qui finit par scene.splinecode.'
  }
  return 'L\'URL doit finir par scene.splinecode (Spline) ou .glb.'
}

// ── Une affiche dans la liste ─────────────────────────────────────────────────
function addItem(data = {}) {
  if (items.length >= MAX_ITEMS) return
  const el = tpl.content.firstElementChild.cloneNode(true)
  const item = { el, id: data.id, scene: data.scene || '', ...DEFAULTS }
  KEYS.forEach(k => { if (Number.isFinite(data[k])) item[k] = data[k] })
  items.push(item)
  listEl.appendChild(el)

  const q = sel => el.querySelector(sel)
  q('.file-msg').dataset.base = 'file-msg'
  q('.scene-msg').dataset.base = 'scene-msg'
  q('.scene').value = item.scene
  KEYS.forEach(k => { q(`[data-k=${k}]`).value = item[k] })
  if (item.id) showThumb(item, posterUrl(item.id), 'Affiche déjà envoyée — choisis une autre image pour la remplacer.')
  if (KEYS.some(k => item[k] !== DEFAULTS[k])) q('details').open = true

  q('.file').onchange = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      item.bitmap = await readImage(file)
    } catch {
      say(q('.file-msg'), 'Impossible de lire cette image.', 'err'); return
    }
    item.id = undefined // nouvelle image → nouvel envoi
    const issues = cropIssues(defaultCrop(item.bitmap.width, item.bitmap.height))
    showThumb(item, thumbFromBitmap(item.bitmap), issues.length
      ? null : `${file.name} — ${item.bitmap.width} × ${item.bitmap.height} px`)
    if (issues.length) say(q('.file-msg'), issues.join(' '), 'err')
    changed()
  }
  q('.scene').oninput = e => { item.scene = e.target.value; changed() }
  KEYS.forEach(k => { q(`[data-k=${k}]`).oninput = e => { item[k] = parseFloat(e.target.value); changed() } })
  q('.remove').onclick = () => {
    items = items.filter(i => i !== item)
    el.remove()
    changed()
  }
  changed()
}

function showThumb(item, src, text) {
  const img = item.el.querySelector('.thumb')
  img.src = src; img.hidden = false
  if (text) say(item.el.querySelector('.file-msg'), text, 'ok')
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

// ── État général ──────────────────────────────────────────────────────────────
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
  counterEl.textContent = items.length > 1
    ? `${items.length} affiches · jusqu'à ${MAX_ITEMS} par expo, 4 visibles en même temps` : ''
  const allOk = items.length > 0 && items.every(itemReady)
  createBtn.disabled = !allOk
  const pending = items.some(i => !i.id)
  createBtn.textContent = linkReady && !pending ? 'Mettre à jour mon lien →' : 'Créer mon lien →'
  if (linkReady && !pending && allOk) renderLink()
  else if (pending) result.classList.remove('visible')
  save()
}

function expo() {
  return {
    title: titleIn.value.trim(),
    items: items.map(i => ({ target: i.id, scene: sceneRef(i.scene), s: i.s, x: i.x, y: i.y, z: i.z, ry: i.ry })),
  }
}

function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      title: titleIn.value,
      items: items.map(({ id, scene, s, x, y, z, ry }) => ({ id, scene, s, x, y, z, ry })),
    }))
  } catch {}
}

function restore() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (!v?.items?.length) return false
    titleIn.value = v.title || ''
    v.items.forEach(addItem)
    return true
  } catch { return false }
}

async function renderLink() {
  const e = expo()
  const link = playerLink(location.origin, e)
  linkIn.value = link
  $('open').href = link
  $('gallery').href = galleryLink(location.origin, e)
  await QRCode.toCanvas(qr, link, { width: 220, margin: 1 })
  $('qr-dl').href = qr.toDataURL('image/png')
  result.classList.add('visible')
}

createBtn.onclick = async () => {
  createBtn.disabled = true
  try {
    const todo = items.filter(i => !i.id)
    for (const [n, item] of todo.entries()) {
      say(createMsg, todo.length > 1 ? `Envoi de l'affiche ${n + 1} / ${todo.length}…` : 'Envoi de l\'affiche…')
      const res = await uploadTarget(buildTarget(item.bitmap))
      item.id = res.id
      save()
    }
    linkReady = true
    await renderLink()
    say(createMsg, 'C\'est prêt.', 'ok')
  } catch (err) {
    say(createMsg, `Échec : ${err.message}`, 'err')
  } finally {
    changed()
  }
}

$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(linkIn.value); say(createMsg, 'Lien copié.', 'ok') }
  catch { linkIn.select(); say(createMsg, 'Sélectionne le lien et copie-le.') }
}

// ── Modifier une expo existante à partir de son lien ──────────────────────────
$('import-btn').onclick = () => {
  const msg = $('import-msg')
  let url
  try { url = new URL($('import').value.trim()) } catch { say(msg, 'Ce n\'est pas un lien valide.', 'err'); return }
  const { title, items: defs } = readItems(url.search)
  const usable = defs.filter(d => ID_RE.test(d.target || ''))
  if (!usable.length) { say(msg, 'Aucune affiche créée ici dans ce lien.', 'err'); return }
  items.forEach(i => i.el.remove())
  items = []
  titleIn.value = title
  usable.forEach(d => addItem({ id: d.target, scene: d.scene, s: d.s, x: d.x, y: d.y, z: d.z, ry: d.ry }))
  linkReady = true
  changed()
  say(msg, `${usable.length} affiche${usable.length > 1 ? 's' : ''} chargée${usable.length > 1 ? 's' : ''}.`, 'ok')
}

addBtn.onclick = () => { addItem(); items[items.length - 1].el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
titleIn.oninput = changed

if (restore()) linkReady = items.every(i => i.id)
else addItem()
changed()
