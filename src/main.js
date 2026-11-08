// Spline AR — player : une ou plusieurs scènes 3D qui sortent d'affiches (mode « musée »).
// Moteur 8th Wall pour la caméra et le suivi d'images (jusqu'à 32 cherchées, 4 suivies).
//   - Scène Spline : runtime Spline officiel (animations, sons, interactions), un canvas
//     transparent par œuvre, caméra pilotée depuis la pose de l'affiche (src/spline-runtime.js).
//   - GLB / glTF, ou ?moteur=loader : three.js pur dans la scène 8th Wall.
// Format du lien : voir src/shared.js.
//   debug=1   cadre de chaque affiche, axes, infos de suivi
//   moteur=loader   scènes Spline rendues par @splinetool/loader (figées)

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readItems, targetUrl, sceneUrl, isGltfRef, MAX_TRACKED } from './shared.js'
import { startBackground } from './background.js'

// Le moteur 8th Wall lit three.js sur window.THREE pour créer son renderer.
window.THREE = THREE

const params = new URLSearchParams(location.search)
const { title, items: itemDefs } = readItems(location.search)
const DEBUG = params.get('debug') === '1'
const ENGINE = params.get('moteur') === 'loader' ? 'loader' : 'runtime'
const MAX_LIVE_RUNTIMES = MAX_TRACKED // scènes Spline gardées en mémoire en même temps

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const startEl = $('start'), btnStart = $('btn-start'), progressEl = $('progress')
const errorEl = $('error'), hintEl = $('hint'), debugEl = $('debug'), badgeEl = $('badge')
const stopBackground = startBackground($('bg-canvas'))

$('title').innerHTML = title
  ? escapeHtml(title)
  : itemDefs.length > 1 ? 'Une expo en <span>réalité augmentée</span>' : 'Une affiche en <span>réalité augmentée</span>'
$('subtitle').textContent = itemDefs.length > 1
  ? `${itemDefs.length} affiches. Autorise la caméra, puis vise une affiche : sa 3D apparaît dessus.`
  : 'Autorise la caméra, puis vise l\'affiche en entier. La 3D apparaît dessus.'
hintEl.textContent = itemDefs.length > 1 ? 'Vise une affiche' : 'Vise l\'affiche'

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
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
function showBadge(text) {
  badgeEl.textContent = text
  badgeEl.classList.toggle('visible', !!text)
}

// ── Cibles ────────────────────────────────────────────────────────────────────
// Le JSON pointe vers son image de luminance ; on la résout à côté du JSON pour
// qu'une cible puisse être hébergée n'importe où (avec CORS).
async function loadTarget(url) {
  const jsonUrl = new URL(url, location.href)
  const res = await fetch(jsonUrl)
  if (!res.ok || !/json/.test(res.headers.get('content-type') || '')) {
    throw new Error(`affiche introuvable (${res.status})`)
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

// ── Chargeurs three.js (GLB, ou Spline figé) ──────────────────────────────────
// Le CDN Spline ne renvoie pas d'en-têtes CORS : on passe par le proxy Netlify.
const proxied = url => url.replace('https://prod.spline.design/', '/spline-proxy/')

async function loadSplineStatic(url) {
  const { default: SplineLoader } = await import('@splinetool/loader')
  return new Promise((resolve, reject) => {
    // Patch repris de SplineXR : Vector3.copy(null) plante pendant le parsing.
    const orig = THREE.Vector3.prototype.copy
    const restore = () => { THREE.Vector3.prototype.copy = orig }
    THREE.Vector3.prototype.copy = function (v) { return v == null ? this : orig.call(this, v) }
    new SplineLoader().load(proxied(url),
      s => { restore(); resolve({ object: s }) }, undefined,
      e => { restore(); reject(e instanceof Error ? e : new Error('chargement Spline')) })
    setTimeout(() => { restore(); reject(new Error('délai dépassé (30 s)')) }, 30000)
  })
}

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, gltf => {
      let mixer = null
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(gltf.scene)
        gltf.animations.forEach(clip => mixer.clipAction(clip).play())
      }
      resolve({ object: gltf.scene, mixer })
    }, undefined, reject)
  })
}

// ── Une œuvre = une affiche + sa scène ────────────────────────────────────────
let xrCamera = null
const liveRuntimes = [] // œuvres dont la scène Spline est chargée, du plus ancien au plus récent

class Artwork {
  constructor(def, index) {
    this.def = def
    this.index = index
    this.url = sceneUrl(def.scene)
    this.kind = isGltfRef(def.scene) ? 'gltf' : ENGINE === 'loader' ? 'loader' : 'runtime'
    this.anchor = new THREE.Group()   // suit l'affiche
    this.content = new THREE.Group() // réglages (x, y, z, ry)
    this.fit = new THREE.Group()     // mise à l'échelle de la 3D sur l'affiche
    this.anchor.add(this.content)
    this.content.add(this.fit)
    this.anchor.visible = false
    this.tracked = false
    this.loading = null
    this.overlay = null
    this.mixer = null
  }

  async loadTarget() {
    this.target = await loadTarget(targetUrl(this.def.target))
    // Noms uniques : le moteur identifie les affiches par leur nom.
    this.target.name = `oeuvre-${this.index}`
    this.poster = posterSize(this.target.properties)
    if (DEBUG) {
      this.anchor.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(this.poster.w, this.poster.h)),
        new THREE.LineBasicMaterial({ color: 0x3ecfcf })))
      this.anchor.add(new THREE.AxesHelper(0.3))
    }
  }

  // Centre la 3D sur l'affiche, arrière posé sur le plan, largeur max = s × largeur d'affiche.
  applyFit(box) {
    const { s, x, y, z, ry } = this.def
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const k = (s * this.poster.w) / (Math.max(size.x, size.y, size.z) || 1)
    this.fit.scale.setScalar(k)
    this.fit.position.set(-center.x * k, -center.y * k, -box.min.z * k)
    this.content.position.set(x * this.poster.w, y * this.poster.w, z * this.poster.w)
    this.content.rotation.set(0, THREE.MathUtils.degToRad(ry), 0)
  }

  // Charge la scène une seule fois, même si l'affiche est détectée en rafale.
  ensureScene() {
    if (this.overlay || this.fit.children.length) return Promise.resolve()
    if (!this.loading) {
      this.loading = this.loadScene()
        .catch(err => { console.error('[SplineAR]', err); debug(`œuvre ${this.index + 1}`, `erreur : ${err.message}`) })
        .finally(() => { this.loading = null })
    }
    return this.loading
  }

  async loadScene() {
    if (this.kind === 'runtime') {
      makeRoomForRuntime()
      const canvas = document.createElement('canvas')
      canvas.className = 'spline-canvas'
      document.body.appendChild(canvas)
      const { createSplineOverlay } = await import('./spline-runtime.js')
      let overlay
      try {
        overlay = await createSplineOverlay(proxied(this.url), canvas)
      } catch (err) {
        canvas.remove()
        throw err
      }
      if (!overlay.bounds) { overlay.dispose(); throw new Error('scène vide') }
      this.applyFit(overlay.bounds)
      overlay.setPose(() => this.pose())
      this.overlay = overlay
      liveRuntimes.push(this)
      if (overlay.cameraType && !/perspective/i.test(overlay.cameraType)) {
        debug(`œuvre ${this.index + 1}`, `caméra Spline ${overlay.cameraType} : passe-la en perspective`)
      }
      if (this.tracked) overlay.show()
    } else {
      const { object, mixer } = this.kind === 'gltf' ? await loadGltf(this.url) : await loadSplineStatic(this.url)
      const cams = []
      object.traverse(o => { if (o.isCamera) cams.push(o) })
      cams.forEach(c => c.parent?.remove(c))
      if (object.isScene) { object.background = null; object.fog = null }
      // On ne touche jamais au transform de la scène Spline (matrixAutoUpdate = false).
      object.updateMatrixWorld(true)
      this.applyFit(new THREE.Box3().setFromObject(object))
      this.fit.add(object)
      this.mixer = mixer
    }
  }

  unloadRuntime() {
    this.overlay?.dispose()
    this.overlay = null
    const i = liveRuntimes.indexOf(this)
    if (i >= 0) liveRuntimes.splice(i, 1)
  }

  // Pose transmise au runtime Spline juste avant chacun de ses rendus.
  pose() {
    if (!this.tracked || !xrCamera) return null
    this.anchor.updateMatrixWorld(true)
    xrCamera.updateMatrixWorld(true)
    return { world: this.fit.matrixWorld, camera: xrCamera.matrixWorld, projection: xrCamera.projectionMatrix }
  }

  onFound(detail) {
    this.anchor.position.set(detail.position.x, detail.position.y, detail.position.z)
    this.anchor.quaternion.set(detail.rotation.x, detail.rotation.y, detail.rotation.z, detail.rotation.w)
    this.anchor.scale.setScalar(detail.scale)
    this.anchor.visible = true
    if (this.tracked) return
    this.tracked = true
    // Récemment vue : passe en fin de file pour ne pas être déchargée.
    const i = liveRuntimes.indexOf(this)
    if (i >= 0) { liveRuntimes.splice(i, 1); liveRuntimes.push(this) }
    this.overlay?.show()
    if (!this.overlay && !this.fit.children.length) {
      showBadge('Chargement de l\'œuvre…')
      this.ensureScene().then(() => showBadge(''))
    }
    debug(`œuvre ${this.index + 1}`, 'trouvée')
  }

  onLost() {
    this.tracked = false
    this.anchor.visible = false
    this.overlay?.hide()
    debug(`œuvre ${this.index + 1}`, 'perdue')
  }
}

// Libère la plus ancienne scène Spline hors champ quand on atteint le plafond.
function makeRoomForRuntime() {
  while (liveRuntimes.length >= MAX_LIVE_RUNTIMES) {
    const victim = liveRuntimes.find(a => !a.tracked)
    if (!victim) break
    victim.unloadRuntime()
  }
}

const artworks = itemDefs.map((def, i) => new Artwork(def, i))
const byName = name => artworks.find(a => a.target?.name === name)

// ── Pipeline 8th Wall ─────────────────────────────────────────────────────────
function updateHint() {
  hintEl.classList.toggle('visible', !artworks.some(a => a.tracked))
}

function arModule() {
  const clock = new THREE.Clock()
  const found = ({ detail }) => { byName(detail.name)?.onFound(detail); updateHint() }
  return {
    name: 'spline-ar',
    onStart: () => {
      const { scene, camera } = XR8.Threejs.xrScene()
      xrCamera = camera
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.9))
      const sun = new THREE.DirectionalLight(0xffffff, 0.8)
      sun.position.set(1, 2, 3)
      scene.add(sun)
      artworks.forEach(a => scene.add(a.anchor))
      camera.position.set(0, 0, 0)
      XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion })
      startEl.classList.add('out')
      stopBackground()
      updateHint()
      showQuit()
      debug('moteur', `three r${THREE.REVISION} · ${ENGINE}`)
    },
    onUpdate: () => {
      const dt = clock.getDelta()
      artworks.forEach(a => a.mixer?.update(dt))
    },
    listeners: [
      { event: 'reality.imagefound', process: found },
      { event: 'reality.imageupdated', process: found },
      { event: 'reality.imagelost', process: ({ detail }) => { byName(detail.name)?.onLost(); updateHint() } },
    ],
  }
}

const xrReady = new Promise(resolve => {
  if (window.XR8) resolve()
  else window.addEventListener('xrloaded', resolve, { once: true })
})

async function prepare() {
  try {
    progressEl.textContent = itemDefs.length > 1 ? 'Chargement des affiches…' : 'Chargement de l\'affiche…'
    const results = await Promise.allSettled(artworks.map(a => a.loadTarget()))
    const failed = results.filter(r => r.status === 'rejected')
    failed.forEach(r => console.error('[SplineAR]', r.reason))
    if (failed.length === artworks.length) throw failed[0].reason
    const ready = artworks.filter(a => a.target)
    if (failed.length) debug('affiches', `${failed.length} introuvable(s)`)

    // La première scène est préchargée ; les autres le seront à la première détection.
    progressEl.textContent = 'Chargement de la 3D…'
    await ready[0].ensureScene()
    if (!ready[0].overlay && !ready[0].fit.children.length) throw new Error('scène illisible')

    await xrReady
    progressEl.textContent = ''
    btnStart.disabled = false
    btnStart.onclick = () => start(ready)
  } catch (err) {
    progressEl.textContent = ''
    fail('Impossible de charger la scène ou l\'affiche.', err)
  }
}

function start(ready) {
  btnStart.disabled = true
  errorEl.classList.remove('visible')
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: ready.map(a => a.target) })
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    XRExtras.AlmostThere.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    arModule(),
  ])
  try {
    XR8.run({ canvas: $('camerafeed'), allowedDevices: XR8.XrConfig.device().ANY })
  } catch (err) {
    fail('Le lancement de l\'AR a échoué.', err)
  }
}

function showQuit() {
  const quit = $('quit')
  quit.classList.add('visible')
  quit.onclick = () => location.reload()
}

prepare()
