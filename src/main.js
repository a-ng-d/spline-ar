// Spline AR — player : une scène Spline (ou un GLB) qui sort d'une affiche.
// Moteur 8th Wall pour la caméra et le suivi d'image.
//   - Scène Spline : runtime Spline officiel (animations, sons, interactions),
//     sur un canvas transparent dont on pilote la caméra (src/spline-runtime.js).
//   - GLB / glTF, ou ?moteur=loader : three.js pur dans la scène 8th Wall.
//
// Paramètres d'URL :
//   scene   URL .splinecode (Spline → Export → Code) ou .glb/.gltf    (défaut : scène de démo)
//   target  identifiant de cible créé sur la page Créer, ou URL d'un JSON de cible
//   s       taille, en largeur d'affiche (1 = aussi large que l'affiche)   défaut 0.8
//   x, y    décalage, en largeur d'affiche (y > 0 = vers le haut)          défaut 0
//   z       décollement de l'affiche, en largeur d'affiche                 défaut 0
//   ry      rotation autour de l'axe vertical, en degrés                    défaut 0
//   moteur  runtime (défaut pour Spline) | loader (Spline figé, three.js pur)
//   debug   1 = cadre de l'affiche, axes et infos de suivi

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { targetUrl } from './shared.js'

// Le moteur 8th Wall lit three.js sur window.THREE pour créer son renderer.
window.THREE = THREE

const DEFAULT_SCENE = 'https://prod.spline.design/h7gKpO9w4utya2UU/scene.splinecode' // iObeya vVR
const DEFAULT_TARGET = '/image-targets/affiche-demo.json'

const params = new URLSearchParams(location.search)
const num = (k, d) => { const v = parseFloat(params.get(k)); return Number.isFinite(v) ? v : d }
const cfg = {
  scene: params.get('scene') || DEFAULT_SCENE,
  target: targetUrl(params.get('target')) || DEFAULT_TARGET,
  s: num('s', 0.8), x: num('x', 0), y: num('y', 0), z: num('z', 0), ry: num('ry', 0),
  engine: params.get('moteur') === 'loader' ? 'loader' : 'runtime',
  debug: params.get('debug') === '1',
}
const isGltf = /\.(glb|gltf)(\?|#|$)/i.test(cfg.scene)
const useRuntime = !isGltf && cfg.engine === 'runtime'

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const startEl = $('start'), btnStart = $('btn-start'), progressEl = $('progress')
const errorEl = $('error'), hintEl = $('hint'), debugEl = $('debug')
const splineCanvas = $('spline-canvas')
$('scene-info').textContent = shortName(cfg.scene)

function shortName(url) {
  try { const u = new URL(url, location.href); return u.hostname + u.pathname } catch { return url }
}
function fail(msg, err) {
  console.error('[SplineAR]', msg, err || '')
  errorEl.textContent = msg + (err?.message ? ` (${err.message})` : '')
  startEl.classList.remove('hidden')
}
const debugState = {}
function debug(k, v) {
  if (!cfg.debug) return
  debugState[k] = v
  debugEl.style.display = 'block'
  debugEl.textContent = Object.entries(debugState).map(([a, b]) => `${a}: ${b}`).join('\n')
}
const progress = e => {
  if (e?.total) progressEl.textContent = `Chargement de la 3D… ${Math.round(e.loaded / e.total * 100)} %`
}

// ── Cible ─────────────────────────────────────────────────────────────────────
// Le JSON pointe vers son image de luminance ; on la résout à côté du JSON pour
// qu'une cible puisse être hébergée n'importe où (avec CORS).
async function loadTarget(url) {
  const jsonUrl = new URL(url, location.href)
  const res = await fetch(jsonUrl)
  if (!res.ok || !/json/.test(res.headers.get('content-type') || '')) {
    throw new Error(`cible introuvable (${res.status})`)
  }
  const data = await res.json()
  const lum = data.resources?.luminanceImage
  data.imagePath = lum
    ? new URL(lum, jsonUrl).href
    : new URL(data.imagePath, location.origin + '/').href
  return data
}

// Dimensions de l'affiche dans le repère de la cible (moteur 8th Wall) :
// plan XY, +Z vers le spectateur ; le côté qui correspond à 4 dans le 3:4 vaut 1.
function posterSize(properties = {}) {
  const { width = 3, height = 4, isRotated = false } = properties
  return isRotated ? { w: 1, h: width / height } : { w: width / height, h: 1 }
}

// ── 3D (three.js) ─────────────────────────────────────────────────────────────
// Le CDN Spline ne renvoie pas d'en-têtes CORS : on passe par le proxy Netlify.
const proxied = url => url.replace('https://prod.spline.design/', '/spline-proxy/')
let mixer = null

async function loadSplineStatic(url) {
  const { default: SplineLoader } = await import('@splinetool/loader')
  return new Promise((resolve, reject) => {
    // Patch repris de SplineXR : Vector3.copy(null) plante pendant le parsing.
    const orig = THREE.Vector3.prototype.copy
    const restore = () => { THREE.Vector3.prototype.copy = orig }
    THREE.Vector3.prototype.copy = function (v) { return v == null ? this : orig.call(this, v) }
    new SplineLoader().load(proxied(url),
      s => { restore(); resolve(s) }, progress,
      e => { restore(); reject(e instanceof Error ? e : new Error('chargement Spline')) })
    setTimeout(() => { restore(); reject(new Error('délai dépassé (30 s)')) }, 30000)
  })
}

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, gltf => {
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(gltf.scene)
        gltf.animations.forEach(clip => mixer.clipAction(clip).play())
      }
      debug('animations', gltf.animations?.length ?? 0)
      resolve(gltf.scene)
    }, progress, reject)
  })
}

async function loadThreeModel(url) {
  const obj = isGltf ? await loadGltf(url) : await loadSplineStatic(url)
  const cams = []
  obj.traverse(o => { if (o.isCamera) cams.push(o) })
  cams.forEach(c => c.parent?.remove(c))
  if (obj.isScene) { obj.background = null; obj.fog = null }
  return obj
}

// ── Mise en place sur l'affiche ───────────────────────────────────────────────
const anchor = new THREE.Group()   // suit l'affiche
const content = new THREE.Group()  // réglages (x, y, z, ry)
const fit = new THREE.Group()      // mise à l'échelle de la 3D sur l'affiche
anchor.add(content)
content.add(fit)
anchor.visible = false

// Centre la 3D sur l'affiche, arrière posé sur le plan, largeur max = s × largeur d'affiche.
function computeFit(box, poster) {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const k = (cfg.s * poster.w) / maxDim
  fit.scale.setScalar(k)
  fit.position.set(-center.x * k, -center.y * k, -box.min.z * k)
  content.position.set(cfg.x * poster.w, cfg.y * poster.w, cfg.z * poster.w)
  content.rotation.set(0, THREE.MathUtils.degToRad(cfg.ry), 0)
  debug('3D', `${size.x.toFixed(0)}×${size.y.toFixed(0)}×${size.z.toFixed(0)} → ×${k.toExponential(2)}`)
}

function placeThreeModel(model, poster) {
  // On ne touche jamais au transform de la scène Spline (matrixAutoUpdate = false).
  model.updateMatrixWorld(true)
  computeFit(new THREE.Box3().setFromObject(model), poster)
  fit.add(model)
}

function addDebugHelpers(poster) {
  anchor.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(poster.w, poster.h)),
    new THREE.LineBasicMaterial({ color: 0x3ecfcf })))
  anchor.add(new THREE.AxesHelper(0.3))
}

// ── Pipeline 8th Wall ─────────────────────────────────────────────────────────
let overlay = null // runtime Spline
let xrCamera = null
let tracked = false

// Pose transmise au runtime Spline juste avant chacun de ses rendus.
function runtimePose() {
  if (!tracked || !xrCamera) return null
  anchor.updateMatrixWorld(true)
  xrCamera.updateMatrixWorld(true)
  return { world: fit.matrixWorld, camera: xrCamera.matrixWorld, projection: xrCamera.projectionMatrix }
}

function arModule(targetName) {
  const clock = new THREE.Clock()
  const found = detail => {
    if (detail.name !== targetName) return
    anchor.position.set(detail.position.x, detail.position.y, detail.position.z)
    anchor.quaternion.set(detail.rotation.x, detail.rotation.y, detail.rotation.z, detail.rotation.w)
    anchor.scale.setScalar(detail.scale)
    anchor.visible = true
    if (!tracked) {
      tracked = true
      overlay?.show()
      hintEl.classList.remove('visible')
    }
    debug('suivi', `trouvée · échelle ${detail.scale.toFixed(3)}`)
  }
  return {
    name: 'spline-ar',
    onStart: () => {
      const { scene, camera } = XR8.Threejs.xrScene()
      xrCamera = camera
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.9))
      const sun = new THREE.DirectionalLight(0xffffff, 0.8)
      sun.position.set(1, 2, 3)
      scene.add(sun)
      scene.add(anchor)
      camera.position.set(0, 0, 0)
      XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion })
      startEl.classList.add('hidden')
      hintEl.classList.add('visible')
      debug('three', `r${THREE.REVISION} · ${useRuntime ? 'runtime Spline' : isGltf ? 'GLB' : 'loader Spline'}`)
      debug('suivi', 'en attente')
    },
    onUpdate: () => {
      const dt = clock.getDelta()
      if (mixer) mixer.update(dt)
    },
    listeners: [
      { event: 'reality.imagefound', process: ({ detail }) => found(detail) },
      { event: 'reality.imageupdated', process: ({ detail }) => found(detail) },
      { event: 'reality.imagelost', process: ({ detail }) => {
        if (detail.name !== targetName) return
        tracked = false
        anchor.visible = false
        overlay?.hide()
        hintEl.classList.add('visible')
        debug('suivi', 'perdue')
      } },
    ],
  }
}

const xrReady = new Promise(resolve => {
  if (window.XR8) resolve()
  else window.addEventListener('xrloaded', resolve, { once: true })
})

async function prepare() {
  try {
    const target = await loadTarget(cfg.target)
    const poster = posterSize(target.properties)
    debug('cible', `${target.name} · ${poster.w.toFixed(2)}×${poster.h.toFixed(2)}`)

    if (useRuntime) {
      progressEl.textContent = 'Chargement de la scène Spline…'
      const { createSplineOverlay } = await import('./spline-runtime.js')
      overlay = await createSplineOverlay(proxied(cfg.scene), splineCanvas)
      overlay.hide()
      if (!overlay.bounds) throw new Error('scène vide')
      computeFit(overlay.bounds, poster)
      overlay.setPose(runtimePose)
      if (overlay.cameraType && !/perspective/i.test(overlay.cameraType)) {
        debug('attention', `caméra Spline ${overlay.cameraType} : passe-la en perspective`)
      }
    } else {
      placeThreeModel(await loadThreeModel(cfg.scene), poster)
    }
    if (cfg.debug) addDebugHelpers(poster)

    await xrReady
    progressEl.textContent = 'Prêt.'
    btnStart.disabled = false
    btnStart.onclick = () => start(target)
  } catch (err) {
    progressEl.textContent = ''
    fail('Impossible de charger la scène ou la cible.', err)
  }
}

function start(target) {
  btnStart.disabled = true
  errorEl.textContent = ''
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: [target] })
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    XRExtras.AlmostThere.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    arModule(target.name),
  ])
  try {
    XR8.run({ canvas: $('camerafeed'), allowedDevices: XR8.XrConfig.device().ANY })
  } catch (err) {
    fail('Le lancement de l\'AR a échoué.', err)
  }
}

prepare()
