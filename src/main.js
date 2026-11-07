// Spline AR — player : une scène Spline (ou un GLB) qui sort d'une affiche.
// Moteur 8th Wall pour la caméra et le suivi d'image, three.js pur pour le rendu
// (pas d'A-Frame : conflits de versions three.js constatés sur SplineXR).
//
// Paramètres d'URL :
//   scene   URL .splinecode (Spline publié) ou .glb/.gltf          (défaut : scène de démo)
//   target  URL du JSON de cible généré par 8th Wall                 (défaut : affiche de démo)
//   s       taille, en largeur d'affiche (1 = aussi large que l'affiche)   défaut 0.8
//   x, y    décalage, en largeur d'affiche (y > 0 = vers le haut)          défaut 0
//   z       décollement de l'affiche, en largeur d'affiche                 défaut 0
//   ry      rotation autour de l'axe vertical, en degrés                    défaut 0
//   debug   1 = cadre de l'affiche, axes et infos de suivi

import * as THREE from 'three'
import SplineLoader from '@splinetool/loader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Le moteur 8th Wall lit three.js sur window.THREE pour créer son renderer :
// on lui donne la même instance que celle du loader Spline.
window.THREE = THREE

const DEFAULT_SCENE = 'https://prod.spline.design/h7gKpO9w4utya2UU/scene.splinecode' // iObeya vVR
const DEFAULT_TARGET = '/image-targets/affiche-demo.json'

const params = new URLSearchParams(location.search)
const num = (k, d) => { const v = parseFloat(params.get(k)); return Number.isFinite(v) ? v : d }
const cfg = {
  scene: params.get('scene') || DEFAULT_SCENE,
  target: params.get('target') || DEFAULT_TARGET,
  s: num('s', 0.8), x: num('x', 0), y: num('y', 0), z: num('z', 0), ry: num('ry', 0),
  debug: params.get('debug') === '1',
}

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const startEl = $('start'), btnStart = $('btn-start'), progressEl = $('progress')
const errorEl = $('error'), hintEl = $('hint'), debugEl = $('debug')
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

// ── Chargement de la cible ────────────────────────────────────────────────────
// Le JSON pointe vers son image de luminance ; on la résout à côté du JSON pour
// qu'une cible puisse être hébergée n'importe où (avec CORS).
async function loadTarget(url) {
  const jsonUrl = new URL(url, location.href)
  const res = await fetch(jsonUrl)
  if (!res.ok) throw new Error(`cible introuvable (${res.status})`)
  const data = await res.json()
  const lum = data.resources?.luminanceImage
  data.imagePath = lum
    ? new URL(lum, jsonUrl).href
    : new URL(data.imagePath, location.origin + '/').href
  return data
}

// ── Chargement de la 3D ───────────────────────────────────────────────────────
// Le CDN Spline ne renvoie pas d'en-têtes CORS : on passe par le proxy Netlify.
const proxied = url => url.replace('https://prod.spline.design/', '/spline-proxy/')
let mixer = null

function loadSpline(url) {
  return new Promise((resolve, reject) => {
    // Patch repris de SplineXR : Vector3.copy(null) plante pendant le parsing.
    const orig = THREE.Vector3.prototype.copy
    const restore = () => { THREE.Vector3.prototype.copy = orig }
    THREE.Vector3.prototype.copy = function (v) { return v == null ? this : orig.call(this, v) }
    new SplineLoader().load(proxied(url),
      s => { restore(); resolve(s) },
      e => { if (e.total) progressEl.textContent = `Chargement de la 3D… ${Math.round(e.loaded / e.total * 100)} %` },
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
    }, e => { if (e.total) progressEl.textContent = `Chargement de la 3D… ${Math.round(e.loaded / e.total * 100)} %` }, reject)
  })
}

async function loadModel(url) {
  const isGltf = /\.(glb|gltf)(\?|#|$)/i.test(url)
  const obj = isGltf ? await loadGltf(url) : await loadSpline(url)
  // Les caméras et le fond éventuels de la scène Spline n'ont rien à faire en AR.
  const cams = []
  obj.traverse(o => { if (o.isCamera) cams.push(o) })
  cams.forEach(c => c.parent?.remove(c))
  if (obj.isScene) { obj.background = null; obj.fog = null }
  return obj
}

// ── Mise en place sur l'affiche ───────────────────────────────────────────────
// Repère de la cible (moteur 8th Wall) : affiche dans le plan XY, hauteur = 1,
// largeur = ratio largeur/hauteur, +Z sort de l'affiche vers le spectateur.
const anchor = new THREE.Group()   // suit l'affiche
const content = new THREE.Group()  // réglages de l'étudiant
anchor.add(content)
anchor.visible = false

function placeModel(model, aspect) {
  // On ne touche jamais au transform de la scène Spline (matrixAutoUpdate = false) :
  // on l'enveloppe et on règle l'enveloppe.
  const fit = new THREE.Group()
  fit.add(model)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const k = (cfg.s * aspect) / maxDim
  fit.scale.setScalar(k)
  // Centré sur l'affiche, l'arrière de l'objet posé sur le plan de l'affiche.
  fit.position.set(-center.x * k, -center.y * k, -box.min.z * k)
  content.clear()
  content.add(fit)
  content.position.set(cfg.x * aspect, cfg.y * aspect, cfg.z * aspect)
  content.rotation.set(0, THREE.MathUtils.degToRad(cfg.ry), 0)
  debug('modèle', `${size.x.toFixed(0)}×${size.y.toFixed(0)}×${size.z.toFixed(0)} → ×${k.toExponential(2)}`)
}

function addDebugHelpers(aspect) {
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(aspect, 1)),
    new THREE.LineBasicMaterial({ color: 0x3ecfcf }))
  anchor.add(frame)
  const axes = new THREE.AxesHelper(0.3)
  anchor.add(axes)
}

// ── Pipeline 8th Wall ─────────────────────────────────────────────────────────
function arModule(aspect, targetName) {
  const clock = new THREE.Clock()
  const show = detail => {
    if (detail.name !== targetName) return
    anchor.position.set(detail.position.x, detail.position.y, detail.position.z)
    anchor.quaternion.set(detail.rotation.x, detail.rotation.y, detail.rotation.z, detail.rotation.w)
    anchor.scale.setScalar(detail.scale)
    anchor.visible = true
    hintEl.classList.remove('visible')
    debug('suivi', `trouvée · échelle ${detail.scale.toFixed(3)}`)
  }
  return {
    name: 'spline-ar',
    onStart: () => {
      const { scene, camera } = XR8.Threejs.xrScene()
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.9))
      const sun = new THREE.DirectionalLight(0xffffff, 0.8)
      sun.position.set(1, 2, 3)
      scene.add(sun)
      scene.add(anchor)
      camera.position.set(0, 0, 0)
      XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion })
      startEl.classList.add('hidden')
      hintEl.classList.add('visible')
      debug('three', `r${THREE.REVISION}`)
      debug('suivi', 'en attente')
    },
    onUpdate: () => {
      const dt = clock.getDelta()
      if (mixer) mixer.update(dt)
    },
    listeners: [
      { event: 'reality.imagefound', process: ({ detail }) => show(detail) },
      { event: 'reality.imageupdated', process: ({ detail }) => show(detail) },
      { event: 'reality.imagelost', process: ({ detail }) => {
        if (detail.name !== targetName) return
        anchor.visible = false
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

let target = null
async function prepare() {
  try {
    const [t, model] = await Promise.all([loadTarget(cfg.target), loadModel(cfg.scene), xrReady])
    target = t
    const p = target.properties || {}
    const aspect = p.isRotated ? p.height / p.width : p.width / p.height || 0.75
    placeModel(model, aspect)
    if (cfg.debug) addDebugHelpers(aspect)
    debug('cible', `${target.name} · ratio ${aspect.toFixed(2)}`)
    progressEl.textContent = 'Prêt.'
    btnStart.disabled = false
    btnStart.onclick = () => start(aspect)
  } catch (err) {
    progressEl.textContent = ''
    fail('Impossible de charger la scène ou la cible.', err)
  }
}

function start(aspect) {
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
    arModule(aspect, target.name),
  ])
  try {
    XR8.run({ canvas: document.getElementById('camerafeed'), allowedDevices: XR8.XrConfig.device().ANY })
  } catch (err) {
    fail('Le lancement de l\'AR a échoué.', err)
  }
}

prepare()
