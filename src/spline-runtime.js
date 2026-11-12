// Official Spline runtime, rendered on its own transparent canvas laid over the 8th Wall
// camera feed. On every frame, right before Spline draws, we replace the pose and the
// projection of ITS camera with the ones computed from the tracked poster or face. Spline keeps
// everything else: animations, states, sounds, events (including touch interactions, since it
// casts its rays from that camera).
//
// Relies on undocumented internals (_renderer.renderSplineScene, _scene.activeCamera):
// the runtime version is pinned in package.json.

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

// Bounding box of the visible meshes, computed with our three.js on the objects of the three.js
// bundled by Spline (same structures: matrixWorld.elements, geometry.boundingBox.min/max).
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
 * @param {string} url  .splinecode URL (already proxied if needed)
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{app, bounds: THREE.Box3|null, cameraType: string, setPose: (fn) => void,
 *   show: () => void, hide: () => void, dispose: () => void}>}
 */
export async function createSplineOverlay(url, canvas) {
  const app = new Application(canvas, { renderer: 'webgl', renderMode: 'continuous' })
  await app.load(url)
  app.setBackgroundColor('rgba(0,0,0,0)')
  app.stop() // paused until the poster / face is found

  const scene = app._scene
  const renderer = app._renderer
  if (!scene || !renderer?.renderSplineScene) {
    throw new Error('unsupported Spline runtime version')
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

// pose() returns { world, camera, projection }:
//   world      Matrix4 — Spline scene frame → 8th Wall world (poster/face × settings × scaling)
//   camera     Matrix4 — matrixWorld of the 8th Wall camera
//   projection Matrix4 — projection of the 8th Wall camera
function applyPose(cam, pose) {
  const p = pose()
  if (!p) return
  _w.copy(p.world)
  _wInv.copy(_w).invert()
  _cam.copy(p.camera)
  _rel.multiplyMatrices(_wInv, _cam) // camera expressed in the Spline scene frame

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
