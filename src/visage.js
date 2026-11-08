// Spline AR — filtre visage façon Snapchat.
// Moteur 8th Wall (FaceController, caméra selfie) pour le suivi du visage. Le chunk « slam »
// est aussi préchargé : XR8.Threejs appelle XR8.XrController au démarrage de la session ; la scène Spline
// (runtime officiel) est accrochée à un point du visage et suit la tête.
// Les expressions sont envoyées à la scène sous forme de variables Spline booléennes
// (bouche, clinGauche, clinDroit, sourcils) quand la scène les déclare.
// Format du lien : voir src/face-shared.js.   debug=1 : axes et infos de suivi.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { sceneUrl, isGltfRef, DEMO } from './shared.js'
import { readFilter, EXPRESSIONS } from './face-shared.js'
import { startBackground } from './background.js'

window.THREE = THREE

const params = new URLSearchParams(location.search)
const DEBUG = params.get('debug') === '1'
const cfg = readFilter(location.search)
if (!cfg.scene) cfg.scene = DEMO.scene
const url = sceneUrl(cfg.scene)
const kind = isGltfRef(cfg.scene) ? 'gltf' : 'runtime'

const $ = id => document.getElementById(id)
const startEl = $('start'), btnStart = $('btn-start'), progressEl = $('progress')
const errorEl = $('error'), hintEl = $('hint'), debugEl = $('debug')
const stopBackground = startBackground($('bg-canvas'))
if (cfg.title) $('title').textContent = cfg.title
document.title = `${cfg.title || 'Filtre visage'} · Spline AR`

function fail(msg, err) {
  console.error('[SplineAR]', msg, err || '')
  errorEl.textContent = msg + (err?.message ? ` (${err.message})` : '')
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

// ── Repères ───────────────────────────────────────────────────────────────────
// anchor : transform du visage (moteur) ; point : point d'ancrage choisi ;
// content : réglages ; fit : mise à l'échelle de la 3D.
const anchor = new THREE.Group()
const point = new THREE.Group()
const content = new THREE.Group()
const fit = new THREE.Group()
anchor.add(point); point.add(content); content.add(fit)
anchor.visible = false

let bounds = null      // boîte englobante de la 3D (repère de la scène)
let fitted = false     // la mise à l'échelle dépend de la largeur du visage, connue à la 1re détection
let overlay = null, mixer = null, xrCamera = null, tracked = false

function applyFit(faceW) {
  const { s, x, y, z, ry } = cfg
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const k = (s * faceW) / (Math.max(size.x, size.y, size.z) || 1)
  fit.scale.setScalar(k)
  fit.position.copy(center).multiplyScalar(-k)
  content.position.set(x * faceW, y * faceW, z * faceW)
  content.rotation.set(0, THREE.MathUtils.degToRad(ry), 0)
  fitted = true
  debug('3D', `×${k.toExponential(2)} · visage ${faceW.toFixed(3)}`)
}

// ── Expressions → variables Spline ────────────────────────────────────────────
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
  for (const { variable, key } of EXPRESSIONS) {
    if (exprState[key] === e[key]) continue
    exprState[key] = e[key]
    if (overlay && splineVars.has(variable)) {
      try { overlay.app.setVariable(variable, e[key]) } catch {}
    }
  }
  if (DEBUG) debug('expressions', EXPRESSIONS.filter(x => e[x.key]).map(x => x.variable).join(', ') || '—')
}

// ── Suivi ─────────────────────────────────────────────────────────────────────
function onFace(detail) {
  const t = detail.transform
  anchor.position.set(t.position.x, t.position.y, t.position.z)
  anchor.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)
  anchor.scale.setScalar(t.scale)
  const pt = cfg.p !== 'face' && detail.attachmentPoints?.[cfg.p]?.position
  if (pt) point.position.set(pt.x, pt.y, pt.z)
  else point.position.set(0, 0, 0)
  if (!fitted && bounds) applyFit(t.scaledWidth / t.scale || 1)
  anchor.visible = true
  pushExpressions(detail)
  if (!tracked) {
    tracked = true
    overlay?.show()
    hintEl.classList.remove('visible')
    debug('suivi', 'visage trouvé')
  }
}
function onFaceLost() {
  tracked = false
  anchor.visible = false
  overlay?.hide()
  hintEl.classList.add('visible')
  debug('suivi', 'visage perdu')
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
    name: 'spline-ar-visage',
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
      debug('moteur', `three r${THREE.REVISION} · ${kind} · point ${cfg.p}`)
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

// ── Chargement ────────────────────────────────────────────────────────────────
async function loadScene() {
  if (kind === 'runtime') {
    const { createSplineOverlay } = await import('./spline-runtime.js')
    const canvas = document.createElement('canvas')
    canvas.className = 'spline-canvas'
    document.body.appendChild(canvas)
    overlay = await createSplineOverlay(proxied(url), canvas)
    if (!overlay.bounds) throw new Error('scène vide')
    bounds = overlay.bounds
    overlay.setPose(pose)
    try {
      splineVars = new Set(Object.keys(overlay.app.getVariables() || {}))
    } catch { splineVars = new Set() }
    const used = EXPRESSIONS.filter(e => splineVars.has(e.variable)).map(e => e.variable)
    debug('variables', used.join(', ') || 'aucune')
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
    progressEl.textContent = 'Chargement de la 3D…'
    await loadScene()
    await xrReady
    progressEl.textContent = ''
    btnStart.disabled = false
    btnStart.onclick = start
  } catch (err) {
    progressEl.textContent = ''
    fail('Impossible de charger la scène.', err)
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

// Sur téléphone : caméra avant. Le moteur l'exige « exactement » (facingMode exact: user) ;
// les webcams d'ordinateur ne déclarent pas d'orientation et seraient refusées, d'où ANY.
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform)) // iPadOS
}

let direction = null
let retried = false
function run(dir) {
  direction = dir
  debug('caméra', dir === 'FRONT' ? 'avant (selfie)' : 'par défaut')
  try {
    XR8.run({
      canvas: $('camerafeed'),
      cameraConfig: { direction: XR8.XrConfig.camera()[dir] },
      allowedDevices: XR8.XrConfig.device().ANY,
    })
  } catch (err) {
    fail('Le lancement de la caméra a échoué.', err)
  }
}

// Si la caméra avant est refusée, on réessaie une fois avec la caméra par défaut.
function onCameraStatus({ status, reason }) {
  debug('caméra état', reason ? `${status} (${reason.name || reason})` : status)
  if (status !== 'failed') return
  if (direction === 'FRONT' && !retried) {
    retried = true
    XR8.stop()
    setTimeout(() => run('ANY'), 300)
  }
}

function showQuit() {
  const quit = $('quit')
  quit.classList.add('visible')
  quit.onclick = () => location.reload()
}

prepare()
