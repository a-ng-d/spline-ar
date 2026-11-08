// Fabrication d'une image target 8th Wall dans le navigateur, à l'identique de
// @8thwall/image-target-cli (crop.js / apply.js, cible plane) :
//   - paysage → image tournée de 90° dans le sens horaire (isRotated)
//   - recadrage centré au ratio 3:4 (largeur:hauteur)
//   - image de luminance : niveaux de gris, 640 px de haut, JPEG

const LUMINANCE_HEIGHT = 640
const MIN_W = 480
const MIN_H = 640
const AFFICHE_MAX = 1600 // côté le plus long de l'affiche stockée pour l'affichage à l'écran

export async function readImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  return bitmap
}

// Même calcul que getDefaultCrop de la CLI.
export function defaultCrop(srcW, srcH) {
  const isRotated = srcW > srcH
  const [width, height] = isRotated ? [srcH, srcW] : [srcW, srcH]
  if (width / 3 > height / 4) {
    const croppedWidth = Math.round((height * 3) / 4)
    return { left: Math.round((width - croppedWidth) / 2), top: 0, width: croppedWidth, height,
      isRotated, originalWidth: width, originalHeight: height }
  }
  const croppedHeight = Math.round((width * 4) / 3)
  return { left: 0, top: Math.round((height - croppedHeight) / 2), width, height: croppedHeight,
    isRotated, originalWidth: width, originalHeight: height }
}

export function cropIssues(crop) {
  const issues = []
  if (crop.width < MIN_W || crop.height < MIN_H) {
    issues.push(`Image trop petite : il faut au moins ${MIN_W} × ${MIN_H} px dans la zone gardée (ici ${crop.width} × ${crop.height}).`)
  }
  return issues
}

// Image (tournée si besoin) dans un canvas, dans le repère de la cible.
function orientedCanvas(bitmap, isRotated) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  if (isRotated) {
    c.width = bitmap.height; c.height = bitmap.width
    ctx.translate(c.width, 0)
    ctx.rotate(Math.PI / 2) // 90° horaire, comme sharp.rotate(90)
  } else {
    c.width = bitmap.width; c.height = bitmap.height
  }
  ctx.drawImage(bitmap, 0, 0)
  return c
}

function toJpeg(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality)
}

export function buildTarget(bitmap) {
  const crop = defaultCrop(bitmap.width, bitmap.height)
  const issues = cropIssues(crop)
  if (issues.length) throw new Error(issues.join(' '))

  const oriented = orientedCanvas(bitmap, crop.isRotated)

  // Luminance : zone recadrée, 640 px de haut, niveaux de gris.
  const lw = Math.round(crop.width * LUMINANCE_HEIGHT / crop.height)
  const lum = document.createElement('canvas')
  lum.width = lw; lum.height = LUMINANCE_HEIGHT
  const lctx = lum.getContext('2d')
  lctx.drawImage(oriented, crop.left, crop.top, crop.width, crop.height, 0, 0, lw, LUMINANCE_HEIGHT)
  const px = lctx.getImageData(0, 0, lw, LUMINANCE_HEIGHT)
  const d = px.data
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])
    d[i] = d[i + 1] = d[i + 2] = y
  }
  lctx.putImageData(px, 0, 0)

  // Affiche à afficher à l'écran ou à imprimer : image d'origine, non tournée, réduite.
  const k = Math.min(1, AFFICHE_MAX / Math.max(bitmap.width, bitmap.height))
  const aff = document.createElement('canvas')
  aff.width = Math.round(bitmap.width * k); aff.height = Math.round(bitmap.height * k)
  aff.getContext('2d').drawImage(bitmap, 0, 0, aff.width, aff.height)

  return {
    properties: crop,
    luminance: toJpeg(lum, 0.9),
    affiche: toJpeg(aff, 0.85),
  }
}

// Rectangle gardé, exprimé dans l'image d'origine (pour l'aperçu).
export function keptRect(bitmap) {
  const c = defaultCrop(bitmap.width, bitmap.height)
  if (!c.isRotated) return { x: c.left, y: c.top, w: c.width, h: c.height }
  // Repère tourné de 90° horaire : (u, v) tourné ↔ (x = v, y = H - u - …) d'origine.
  return { x: c.top, y: bitmap.height - c.left - c.width, w: c.height, h: c.width }
}

export async function uploadTarget(t) {
  const res = await fetch('/api/cibles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(t),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `envoi refusé (${res.status})`)
  return body
}
