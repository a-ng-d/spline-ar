// Spline AR — museum player: one or more 3D scenes coming out of posters.
// 8th Wall engine for the camera and image tracking (up to 32 searched, 4 tracked).
//   - Spline scene: official Spline runtime (animations, sounds, interactions), one transparent
//     canvas per artwork, its camera driven from the poster pose (src/spline-runtime.js).
//   - GLB / glTF, or ?moteur=loader: plain three.js inside the 8th Wall scene.
// Link format: see src/shared.js.
//   debug=1          frame of each poster, axes, tracking info
//   moteur=loader    Spline scenes rendered by @splinetool/loader (static)

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readItems, targetUrl, sceneUrl, isGltfRef, MAX_TRACKED } from './shared.js'
import { startBackground } from './background.js'
import { initI18n, t, tn, setText, onLanguageChange, mountLanguageSwitch } from './i18n.js'

// The 8th Wall engine reads three.js from window.THREE to create its renderer.
window.THREE = THREE

const params = new URLSearchParams(location.search)
const { title, back: BACK, items: itemDefs } = readItems(location.search)
const DEBUG = params.get('debug') === '1'
const ENGINE = params.get('moteur') === 'loader' ? 'loader' : 'runtime'
const MAX_LIVE_RUNTIMES = MAX_TRACKED // Spline scenes kept in memory at the same time
const MANY = itemDefs.length > 1

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const startEl = $('start'), btnStart = $('btn-start'), progressEl = $('progress')
const errorEl = $('error'), hintEl = $('hint'), debugEl = $('debug'), badgeEl = $('badge')
const stopBackground = startBackground($('bg-canvas'))

await initI18n()
mountLanguageSwitch($('lang-slot'))

// Texts that depend on the link (title, number of posters) and on the language.
function renderTexts() {
  const kind = MANY ? tn('museum.kind', itemDefs.length) : t('museum.kindSingle')
  $('kicker').textContent = kind
  document.title = `${title || kind} · Spline AR`
  const h1 = $('title')
  if (title) h1.textContent = title
  else h1.innerHTML = t(MANY ? 'museum.player.titleMany' : 'museum.player.titleOne')
  setText($('subtitle'), MANY ? 'museum.player.subtitleMany' : 'museum.player.subtitleOne', { n: itemDefs.length })
  setText(hintEl, MANY ? 'museum.player.hintMany' : 'museum.player.hintOne')
  setText($('quit'), BACK ? 'player.back' : 'player.quit')
}
renderTexts()
onLanguageChange(renderTexts)

// A creation's link (not the demo): "Edit" reopens the editor with this link.
if (params.has('o') || params.has('target')) {
  const edit = $('edit-link')
  edit.href = `/creer/musee${location.search}`
  setText(edit, MANY ? 'museum.player.editMany' : 'museum.player.editOne')
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
function showBadge(key) {
  setText(badgeEl, key)
  badgeEl.classList.toggle('visible', !!key)
}

// ── Targets ───────────────────────────────────────────────────────────────────
// The JSON points to its luminance image; we resolve it next to the JSON so that a target can
// be hosted anywhere (with CORS).
async function loadTarget(url) {
  const jsonUrl = new URL(url, location.href)
  const res = await fetch(jsonUrl)
  if (!res.ok || !/json/.test(res.headers.get('content-type') || '')) {
    throw new Error(`poster not found (${res.status})`)
  }
  const data = await res.json()
  const lum = data.resources?.luminanceImage
  data.imagePath = lum
    ? new URL(lum, jsonUrl).href
    : new URL(data.imagePath, location.origin + '/').href
  return data
}

// Poster size in the target frame (8th Wall engine): XY plane, +Z towards the viewer; the side
// matching "4" in the 3:4 ratio is 1.
function posterSize(properties = {}) {
  const { width = 3, height = 4, isRotated = false } = properties
  return isRotated ? { w: 1, h: width / height } : { w: width / height, h: 1 }
}

// ── three.js loaders (GLB, or static Spline) ──────────────────────────────────
// Spline's CDN sends no CORS headers: we go through the Netlify proxy.
const proxied = url => url.replace('https://prod.spline.design/', '/spline-proxy/')

async function loadSplineStatic(url) {
  const { default: SplineLoader } = await import('@splinetool/loader')
  return new Promise((resolve, reject) => {
    // Patch from SplineXR: Vector3.copy(null) crashes during parsing.
    const orig = THREE.Vector3.prototype.copy
    const restore = () => { THREE.Vector3.prototype.copy = orig }
    THREE.Vector3.prototype.copy = function (v) { return v == null ? this : orig.call(this, v) }
    new SplineLoader().load(proxied(url),
      s => { restore(); resolve({ object: s }) }, undefined,
      e => { restore(); reject(e instanceof Error ? e : new Error('Spline loading failed')) })
    setTimeout(() => { restore(); reject(new Error('timeout (30 s)')) }, 30000)
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

// ── An artwork = a poster + its scene ─────────────────────────────────────────
let xrCamera = null
const liveRuntimes = [] // artworks whose Spline scene is loaded, oldest first

class Artwork {
  constructor(def, index) {
    this.def = def
    this.index = index
    this.url = sceneUrl(def.scene)
    this.kind = isGltfRef(def.scene) ? 'gltf' : ENGINE === 'loader' ? 'loader' : 'runtime'
    this.anchor = new THREE.Group()  // follows the poster
    this.content = new THREE.Group() // settings (x, y, z, ry, pl)
    this.fit = new THREE.Group()     // scaling of the 3D onto the poster
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
    // Unique names: the engine identifies posters by name.
    this.target.name = `artwork-${this.index}`
    this.poster = posterSize(this.target.properties)
    if (DEBUG) {
      this.anchor.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(this.poster.w, this.poster.h)),
        new THREE.LineBasicMaterial({ color: 0x3ecfcf })))
      this.anchor.add(new THREE.AxesHelper(0.3))
    }
  }

  // Max size = s × poster width, centred on the poster.
  //   Wall (pl = 0): back of the scene on the poster, scene up = poster up.
  //   Flat (pl = 1): scene stood up by 90° (up towards the sky, front towards the bottom edge of
  //   the poster), base on the image; the rotation then turns around the vertical.
  applyFit(box) {
    const { s, x, y, z, ry, pl } = this.def
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const k = (s * this.poster.w) / (Math.max(size.x, size.y, size.z) || 1)
    this.fit.scale.setScalar(k)
    if (pl === 1) this.fit.position.set(-center.x * k, -box.min.y * k, -center.z * k)
    else this.fit.position.set(-center.x * k, -center.y * k, -box.min.z * k)
    this.content.position.set(x * this.poster.w, y * this.poster.w, z * this.poster.w)
    this.content.rotation.set(pl === 1 ? Math.PI / 2 : 0, THREE.MathUtils.degToRad(ry), 0)
  }

  // Loads the scene only once, even if the poster is detected repeatedly.
  ensureScene() {
    if (this.overlay || this.fit.children.length) return Promise.resolve()
    if (!this.loading) {
      this.loading = this.loadScene()
        .catch(err => { console.error('[SplineAR]', err); debug(`artwork ${this.index + 1}`, `error: ${err.message}`) })
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
      if (!overlay.bounds) { overlay.dispose(); throw new Error('empty scene') }
      this.applyFit(overlay.bounds)
      overlay.setPose(() => this.pose())
      this.overlay = overlay
      liveRuntimes.push(this)
      if (overlay.cameraType && !/perspective/i.test(overlay.cameraType)) {
        debug(`artwork ${this.index + 1}`, `Spline camera ${overlay.cameraType}: switch it to perspective`)
      }
      if (this.tracked) overlay.show()
    } else {
      const { object, mixer } = this.kind === 'gltf' ? await loadGltf(this.url) : await loadSplineStatic(this.url)
      const cams = []
      object.traverse(o => { if (o.isCamera) cams.push(o) })
      cams.forEach(c => c.parent?.remove(c))
      if (object.isScene) { object.background = null; object.fog = null }
      // Never touch the Spline scene's own transform (matrixAutoUpdate = false).
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

  // Pose given to the Spline runtime right before each of its renders.
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
    // Recently seen: move to the end of the queue so it is not unloaded.
    const i = liveRuntimes.indexOf(this)
    if (i >= 0) { liveRuntimes.splice(i, 1); liveRuntimes.push(this) }
    this.overlay?.show()
    if (!this.overlay && !this.fit.children.length) {
      showBadge('museum.player.loadingArtwork')
      this.ensureScene().then(() => showBadge(''))
    }
    debug(`artwork ${this.index + 1}`, 'found')
  }

  onLost() {
    this.tracked = false
    this.anchor.visible = false
    this.overlay?.hide()
    debug(`artwork ${this.index + 1}`, 'lost')
  }
}

// Frees the oldest off-screen Spline scene when the cap is reached.
function makeRoomForRuntime() {
  while (liveRuntimes.length >= MAX_LIVE_RUNTIMES) {
    const victim = liveRuntimes.find(a => !a.tracked)
    if (!victim) break
    victim.unloadRuntime()
  }
}

const artworks = itemDefs.map((def, i) => new Artwork(def, i))
const byName = name => artworks.find(a => a.target?.name === name)

// ── 8th Wall pipeline ─────────────────────────────────────────────────────────
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
      debug('engine', `three r${THREE.REVISION} · ${ENGINE}`)
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
    setText(progressEl, MANY ? 'museum.player.loadingPosters' : 'museum.player.loadingPoster')
    const results = await Promise.allSettled(artworks.map(a => a.loadTarget()))
    const failed = results.filter(r => r.status === 'rejected')
    failed.forEach(r => console.error('[SplineAR]', r.reason))
    if (failed.length === artworks.length) throw failed[0].reason
    const ready = artworks.filter(a => a.target)
    if (failed.length) debug('posters', `${failed.length} not found`)

    // The first scene is preloaded; the others load when their poster is first detected.
    setText(progressEl, 'player.loading3d')
    await ready[0].ensureScene()
    if (!ready[0].overlay && !ready[0].fit.children.length) throw new Error('unreadable scene')

    await xrReady
    setText(progressEl, '')
    btnStart.disabled = false
    btnStart.onclick = () => start(ready)
  } catch (err) {
    setText(progressEl, '')
    fail('museum.player.errorLoad', err)
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
    fail('player.errorStart', err)
  }
}

// Quit: go to the back link if there is one (e.g. a ProtoPie prototype), otherwise reload the
// page (camera off, back to the link's start screen).
function showQuit() {
  const quit = $('quit')
  quit.classList.add('visible')
  quit.onclick = () => { if (BACK) location.href = BACK; else location.reload() }
}

prepare()
