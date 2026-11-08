// Runtime Spline officiel, rendu sur son propre canvas transparent posé au-dessus
// de la vidéo 8th Wall. À chaque image, juste avant que Spline ne dessine, on
// remplace la pose et l'optique de SA caméra par celles calculées depuis le suivi
// de l'affiche. Spline garde tout le reste : animations, états, sons, événements
// (y compris les interactions tactiles, puisqu'il lance ses rayons depuis cette caméra).
//
// Dépend d'internes non documentés (_renderer.renderSplineScene, _scene.activeCamera) :
// version du runtime figée dans package.json.

import * as THREE from 'three'
import { Application } from '@splinetool/runtime'

const _w = new THREE.Matrix4()
const _wInv = new THREE.Matrix4()
const _cam = new THREE.Matrix4()
const _rel = new THREE.Matrix4()
const _parent = new THREE.Matrix4()
const _local = new THREE.Matrix4()
const _proj = new THREE.Matrix4()
const _projInv = new THREE.Matrix4()

// Boîte englobante des maillages visibles, calculée avec notre three.js sur les
// objets du three.js embarqué par Spline (mêmes structures : matrixWorld.elements,
// geometry.boundingBox.min/max).
function sceneBounds(scene) {
  const box = new THREE.Box3()
  const tmp = new THREE.Box3()
  const m = new THREE.Matrix4()
  scene.updateMatrixWorld?.(true)
  const visit = obj => {
    if (obj.visible === false) return
    const g = obj.geometry
    if ((obj.isMesh || obj.isPoints || obj.isLine) && g) {
      if (!g.boundingBox && g.computeBoundingBox) g.computeBoundingBox()
      const b = g.boundingBox
      if (b && Number.isFinite(b.min.x) && Number.isFinite(b.max.x)) {
        tmp.min.set(b.min.x, b.min.y, b.min.z)
        tmp.max.set(b.max.x, b.max.y, b.max.z)
        m.fromArray(obj.matrixWorld.elements)
        tmp.applyMatrix4(m)
        box.union(tmp)
      }
    }
    obj.children?.forEach(visit)
  }
  visit(scene)
  return box.isEmpty() ? null : box
}

/**
 * @param {string} url       URL .splinecode (déjà passée par le proxy si besoin)
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{app, bounds: THREE.Box3|null, setPose: (fn) => void, show: () => void, hide: () => void}>}
 */
export async function createSplineOverlay(url, canvas) {
  const app = new Application(canvas, { renderer: 'webgl', renderMode: 'continuous' })
  await app.load(url)
  app.setBackgroundColor('rgba(0,0,0,0)')
  app.stop() // en pause tant que l'affiche n'a pas été trouvée

  const scene = app._scene
  const renderer = app._renderer
  if (!scene || !renderer?.renderSplineScene) {
    throw new Error('version du runtime Spline non prise en charge')
  }

  let poseFn = null
  const orig = renderer.renderSplineScene.bind(renderer)
  renderer.renderSplineScene = (s, cam) => {
    if (poseFn && cam) applyPose(cam, poseFn)
    return orig(s, cam)
  }

  let started = false
  return {
    app,
    bounds: sceneBounds(scene),
    cameraType: scene.activeCamera?.cameraType || scene.activeCamera?.type,
    setPose: fn => { poseFn = fn },
    show: () => {
      canvas.style.visibility = 'visible'
      if (!started) { started = true; app.play() }
    },
    hide: () => { canvas.style.visibility = 'hidden' },
    dispose: () => {
      poseFn = null
      try { app.dispose() } catch {}
      canvas.remove()
    },
  }
}

// pose() renvoie { world, camera, projection } :
//   world      Matrix4 — repère Spline → monde 8th Wall (affiche × réglages × mise à l'échelle)
//   camera     Matrix4 — matrixWorld de la caméra 8th Wall
//   projection Matrix4 — projection de la caméra 8th Wall
function applyPose(cam, pose) {
  const p = pose()
  if (!p) return
  _w.copy(p.world)
  _wInv.copy(_w).invert()
  _cam.copy(p.camera)
  _rel.multiplyMatrices(_wInv, _cam) // caméra exprimée dans le repère de la scène Spline

  if (cam.parent?.matrixWorld) {
    _parent.fromArray(cam.parent.matrixWorld.elements).invert()
    _local.multiplyMatrices(_parent, _rel)
  } else {
    _local.copy(_rel)
  }
  cam.matrixAutoUpdate = false
  cam.matrix.fromArray(_local.elements)
  cam.matrixWorld.fromArray(_rel.elements)
  cam.matrixWorldInverse?.fromArray(_rel.clone().invert().elements)
  cam.matrixWorldNeedsUpdate = false

  _proj.copy(p.projection)
  _projInv.copy(_proj).invert()
  cam.projectionMatrix.fromArray(_proj.elements)
  cam.projectionMatrixInverse?.fromArray(_projInv.elements)
}
