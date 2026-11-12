// Spline AR — Snapchat-style face filter.
// 8th Wall engine (FaceController, selfie camera) for face tracking; the Spline scene (official
// runtime) is attached to a point of the face and follows the head.
// Expressions are sent to the scene as boolean Spline variables when the scene declares them
// (see EXPRESSIONS in src/filter-shared.js: English or French names).
// Link format: see src/filter-shared.js.   debug=1: axes and tracking info.
//   reglage=1&w=<id>   live tuning panel (opened from the filter editor), saved to "My creations"

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { sceneUrl, isGltfRef, DEMO, TYPE_FILTER } from './shared.js'
import { readFilter, filterLink, EXPRESSIONS, POINTS } from './filter-shared.js'
import { saveWork, getWork } from './works.js'
import { startBackground } from './background.js'
import { initI18n, t, setText, onLanguageChange, mountLanguageSwitch } from './i18n.js'

window.THREE = THREE

const params = new URLSearchParams(location.search)
const DEBUG = params.get('debug') === '1'
const TUNING = params.get('reglage') === '1' // live tuning panel (opened from the editor)
let workId = params.get('w') || null
const cfg = readFilter(location.search)
if (!cfg.scene) cfg.scene = DEMO.scene
const BACK = cfg.back
const url = sceneUrl(cfg.scene)
const kind = isGltfRef(cfg.scene) ? 'gltf' : 'runtime'

const $ = id => document.getElementById(id)
const startEl = $('start'), btnStart = $('btn-start'), progressEl = $('progress')
const errorEl = $('error'), hintEl = $('hint'), debugEl = $('debug')
const stopBackground = startBackground($('bg-canvas'))

await initI18n()
mountLanguageSwitch($('lang-slot'))

function renderTexts() {
  const h1 = $('title')
  if (cfg.title) h1.textContent = cfg.title
  else h1.innerHTML = t('filter.player.title')
  document.title = `${cfg.title || t('types.filter')} · Spline AR`
  setText($('quit'), BACK ? 'player.back' : 'player.quit')
}
renderTexts()
onLanguageChange(renderTexts)

// A created filter's link (not the demo): "Edit" reopens the editor with this link.
if (params.has('scene')) {
  const edit = $('edit-link')
  edit.href = workId && getWork(workId)
    ? `/creer/filtre?w=${encodeURIComponent(workId)}`
    : `/creer/filtre${new URL(filterLink(location.origin, cfg)).search}`
  edit.hidden = false
}
if (BACK) { const b = $('back-link'); b.href = BACK; b.hidden = false }

function fail(key, err) {
  console.error('[SplineAR]', key, err || '')
  setText(errorEl, key, { detail: err?.message ? `(${err.message})` : '' })
  errorEl.classList.add('visible')
  startEl.classList.remove('out')
}
const debugState = {}
function debug(k, v) {
  if (!DEBUG) return
  debugState[k] = v
  debugEl.style.display = 'block'
  debugEl.textContent = Object.entries(debugState).map(([a, b]) => `${a}: ${b}`).join('\n')
}
const proxied = u => u.replace('https://prod.spline.design/', '/spline-proxy/')

// ── Frames ────────────────────────────────────────────────────────────────────
// anchor: face transform (engine); point: chosen anchor point; content: settings; fit: scaling.
const anchor = new THREE.Group()
const point = new THREE.Group()
const content = new THREE.Group()
const fit = new THREE.Group()
anchor.add(point); point.add(content); content.add(fit)
anchor.visible = false

let bounds = null  // bounding box of the 3D (scene frame)
let faceW = 0      // face width in the anchor-point frame, measured at first detection
let fitted = false
let overlay = null, mixer = null, xrCamera = null, tracked = false

// Face width measured in the same frame as the anchor points: distance between the outer eye
// corners × 1.6 (≈ cheek width). Fallback: width provided by the engine.
function measureFaceWidth(detail) {
  const a = detail.attachmentPoints?.leftEyeOuterCorner?.position
  const b = detail.attachmentPoints?.rightEyeOuterCorner?.position
  if (a && b) {
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    if (d > 0) return { w: d * 1.6, from: 'eyes' }
  }
  const tr = detail.transform
  return { w: (tr.scaledWidth / tr.scale) || 1, from: 'engine' }
}

// Visible marker of the anchor point (debug and tuning): small cyan sphere rendered by 8th Wall.
const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0x3ecfcf, depthTest: false }))
marker.visible = DEBUG || TUNING
point.add(marker)

function applyFit() {
  if (!faceW || !bounds) return
  const { s, x, y, z, ry } = cfg
  marker.scale.setScalar(faceW * 0.035)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const k = (s * faceW) / (Math.max(size.x, size.y, size.z) || 1)
  fit.scale.setScalar(k)
  fit.position.copy(center).multiplyScalar(-k)
  content.position.set(x * faceW, y * faceW, z * faceW)
  content.rotation.set(0, THREE.MathUtils.degToRad(ry), 0)
  fitted = true
  debug('3D', `×${k.toExponential(2)} · face ${faceW.toFixed(3)}`)
}

// ── Expressions → Spline variables ────────────────────────────────────────────
let splineVars = new Set()
const exprState = {}
function readExpressions(d) {
  return {
    mouthOpen: !!d.mouthOpen,
    leftEyeClosed: d.leftEyeOpen === false,
    rightEyeClosed: d.rightEyeOpen === false,
    eyebrowsRaised: !!(d.leftEyebrowRaised || d.rightEyebrowRaised),
  }
}
function pushExpressions(d) {
  const e = readExpressions(d)
  for (const { key, variables } of EXPRESSIONS) {
    if (exprState[key] === e[key]) continue
    exprState[key] = e[key]
    if (!overlay) continue
    for (const name of variables) {
      if (splineVars.has(name)) { try { overlay.app.setVariable(name, e[key]) } catch {} }
    }
  }
  if (DEBUG) debug('expressions', EXPRESSIONS.filter(x => e[x.key]).map(x => x.key).join(', ') || '—')
}

// ── Tracking ──────────────────────────────────────────────────────────────────
function onFace(detail) {
  const tr = detail.transform
  anchor.position.set(tr.position.x, tr.position.y, tr.position.z)
  anchor.quaternion.set(tr.rotation.x, tr.rotation.y, tr.rotation.z, tr.rotation.w)
  anchor.scale.setScalar(tr.scale)
  const pt = cfg.p !== 'face' && detail.attachmentPoints?.[cfg.p]?.position
  if (pt) point.position.set(pt.x, pt.y, pt.z)
  else point.position.set(0, 0, 0)
  if (!faceW) {
    const m = measureFaceWidth(detail)
    faceW = m.w
    debug('face', `width ${faceW.toFixed(3)} (${m.from}) · engine scale ${tr.scale.toFixed(3)}`)
  }
  if (!fitted) applyFit()
  anchor.visible = true
  pushExpressions(detail)
  if (!tracked) {
    tracked = true
    overlay?.show()
    hintEl.classList.remove('visible')
    debug('tracking', 'face found')
  }
}
function onFaceLost() {
  tracked = false
  anchor.visible = false
  overlay?.hide()
  hintEl.classList.add('visible')
  debug('tracking', 'face lost')
}

function pose() {
  if (!tracked || !fitted || !xrCamera) return null
  anchor.updateMatrixWorld(true)
  xrCamera.updateMatrixWorld(true)
  return { world: fit.matrixWorld, camera: xrCamera.matrixWorld, projection: xrCamera.projectionMatrix }
}

function faceModule() {
  const clock = new THREE.Clock()
  return {
    name: 'spline-ar-face',
    onStart: () => {
      const { scene, camera } = XR8.Threejs.xrScene()
      xrCamera = camera
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.9))
      const sun = new THREE.DirectionalLight(0xffffff, 0.8)
      sun.position.set(0, 1, 2)
      scene.add(sun)
      scene.add(anchor)
      if (DEBUG) anchor.add(new THREE.AxesHelper(0.3))
      camera.position.set(0, 0, 0)
      startEl.classList.add('out')
      stopBackground()
      hintEl.classList.add('visible')
      showQuit()
      if (TUNING) mountTuning()
      debug('engine', `three r${THREE.REVISION} · ${kind} · point ${cfg.p}`)
    },
    onUpdate: () => { mixer?.update(clock.getDelta()) },
    onCameraStatusChange: onCameraStatus,
    listeners: [
      { event: 'facecontroller.facefound', process: ({ detail }) => onFace(detail) },
      { event: 'facecontroller.faceupdated', process: ({ detail }) => onFace(detail) },
      { event: 'facecontroller.facelost', process: onFaceLost },
    ],
  }
}

// ── Loading ───────────────────────────────────────────────────────────────────
async function loadScene() {
  if (kind === 'runtime') {
    const { createSplineOverlay } = await import('./spline-runtime.js')
    const canvas = document.createElement('canvas')
    canvas.className = 'spline-canvas'
    document.body.appendChild(canvas)
    overlay = await createSplineOverlay(proxied(url), canvas)
    if (!overlay.bounds) throw new Error('empty scene')
    bounds = overlay.bounds
    overlay.setPose(pose)
    try {
      splineVars = new Set(Object.keys(overlay.app.getVariables() || {}))
    } catch { splineVars = new Set() }
    const used = EXPRESSIONS.flatMap(e => e.variables).filter(v => splineVars.has(v))
    debug('variables', used.join(', ') || 'none')
  } else {
    const gltf = await new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej))
    if (gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(gltf.scene)
      gltf.animations.forEach(c => mixer.clipAction(c).play())
    }
    gltf.scene.updateMatrixWorld(true)
    bounds = new THREE.Box3().setFromObject(gltf.scene)
    fit.add(gltf.scene)
  }
}

const xrReady = new Promise(resolve => {
  if (window.XR8) resolve()
  else window.addEventListener('xrloaded', resolve, { once: true })
})

async function prepare() {
  try {
    setText(progressEl, 'player.loading3d')
    await loadScene()
    await xrReady
    setText(progressEl, '')
    btnStart.disabled = false
    btnStart.onclick = start
  } catch (err) {
    setText(progressEl, '')
    fail('filter.player.errorLoad', err)
  }
}

function start() {
  btnStart.disabled = true
  errorEl.classList.remove('visible')
  XR8.FaceController.configure({
    meshGeometry: [XR8.FaceController.MeshGeometry.FACE],
    coordinates: { mirroredDisplay: true },
    maxDetections: 1,
  })
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.FaceController.pipelineModule(),
    XRExtras.AlmostThere.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    faceModule(),
  ])
  run(isMobile() ? 'FRONT' : 'ANY')
}

// On phones: front camera. The engine requires it "exactly" (facingMode exact: user); desktop
// webcams declare no facing mode and would be refused, hence ANY.
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform)) // iPadOS
}

let direction = null
let retried = false
function run(dir) {
  direction = dir
  debug('camera', dir === 'FRONT' ? 'front (selfie)' : 'default')
  try {
    XR8.run({
      canvas: $('camerafeed'),
      cameraConfig: { direction: XR8.XrConfig.camera()[dir] },
      allowedDevices: XR8.XrConfig.device().ANY,
    })
  } catch (err) {
    fail('filter.player.errorCamera', err)
  }
}

// If the front camera is refused, retry once with the default camera.
function onCameraStatus({ status, reason }) {
  debug('camera status', reason ? `${status} (${reason.name || reason})` : status)
  if (status !== 'failed') return
  if (direction === 'FRONT' && !retried) {
    retried = true
    XR8.stop()
    setTimeout(() => run('ANY'), 300)
  }
}

// ── Live tuning (?reglage=1) ──────────────────────────────────────────────────
// Sliders act on the running filter; "Save" updates the creation in "My creations" (the editor
// open in the other tab updates itself).
function mountTuning() {
  const panel = $('tuning')
  panel.hidden = false
  document.body.classList.add('tuning-on')
  const sel = panel.querySelector('select')
  const fillPoints = () => {
    sel.replaceChildren(...POINTS.map(p => new Option(t(p.labelKey), p.id)))
    sel.value = cfg.p
  }
  fillPoints()
  onLanguageChange(fillPoints)
  sel.onchange = () => { cfg.p = sel.value; dirty() }
  panel.querySelectorAll('input[type=range]').forEach(input => {
    const k = input.dataset.k
    const out = input.nextElementSibling
    input.value = cfg[k]
    out.textContent = cfg[k] + (k === 'ry' ? '°' : '')
    input.oninput = () => {
      cfg[k] = parseFloat(input.value)
      out.textContent = input.value + (k === 'ry' ? '°' : '')
      applyFit()
      dirty()
    }
  })
  const msg = panel.querySelector('.msg')
  const dirty = () => { setText(msg, 'filter.tuning.dirty'); msg.className = 'msg' }
  panel.querySelector('.save').onclick = () => {
    const link = filterLink(location.origin, cfg)
    workId = saveWork({ id: workId, type: TYPE_FILTER, search: new URL(link).search })
    history.replaceState(null, '', `${new URL(link).search}&reglage=1&w=${encodeURIComponent(workId)}`)
    setText(msg, 'filter.tuning.saved'); msg.className = 'msg ok'
  }
  panel.querySelector('.fold').onclick = () => panel.classList.toggle('folded')
}

// Quit: go to the back link if there is one (e.g. a ProtoPie prototype), otherwise reload the
// page (camera off, back to the link's start screen).
function showQuit() {
  const quit = $('quit')
  quit.classList.add('visible')
  quit.onclick = () => { if (BACK) location.href = BACK; else location.reload() }
}

prepare()
