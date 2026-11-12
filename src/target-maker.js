// Builds an 8th Wall image target in the browser, matching @8thwall/image-target-cli
// (crop.js / apply.js, planar target):
//   - landscape image → rotated 90° clockwise (isRotated)
//   - centred crop at a 3:4 (width:height) ratio
//   - luminance image: greyscale, 640 px high, JPEG

const LUMINANCE_HEIGHT = 640
const MIN_W = 480
const MIN_H = 640
const POSTER_MAX = 1600 // longest side of the poster image stored for on-screen display / printing

export async function readImage(file) {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

// Same computation as getDefaultCrop in the CLI.
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

// Returns a list of { key, params } i18n messages (empty when the image is usable).
export function cropIssues(crop) {
  const issues = []
  if (crop.width < MIN_W || crop.height < MIN_H) {
    issues.push({ key: 'errors.image.tooSmall', params: { minW: MIN_W, minH: MIN_H, w: crop.width, h: crop.height } })
  }
  return issues
}

// Image (rotated if needed) drawn in a canvas, in the target's frame.
function orientedCanvas(bitmap, isRotated) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  if (isRotated) {
    c.width = bitmap.height; c.height = bitmap.width
    ctx.translate(c.width, 0)
    ctx.rotate(Math.PI / 2) // 90° clockwise, like sharp.rotate(90)
  } else {
    c.width = bitmap.width; c.height = bitmap.height
  }
  ctx.drawImage(bitmap, 0, 0)
  return c
}

const toJpeg = (canvas, quality) => canvas.toDataURL('image/jpeg', quality)

export class ImageIssueError extends Error {
  constructor(issues) { super(issues[0]?.key || 'errors.image.unreadable'); this.issues = issues }
}

export function buildTarget(bitmap) {
  const crop = defaultCrop(bitmap.width, bitmap.height)
  const issues = cropIssues(crop)
  if (issues.length) throw new ImageIssueError(issues)

  const oriented = orientedCanvas(bitmap, crop.isRotated)

  // Luminance: cropped area, 640 px high, greyscale.
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

  // Poster to show on a screen or print: original image, not rotated, downscaled.
  const k = Math.min(1, POSTER_MAX / Math.max(bitmap.width, bitmap.height))
  const poster = document.createElement('canvas')
  poster.width = Math.round(bitmap.width * k); poster.height = Math.round(bitmap.height * k)
  poster.getContext('2d').drawImage(bitmap, 0, 0, poster.width, poster.height)

  return {
    properties: crop,
    luminance: toJpeg(lum, 0.9),
    poster: toJpeg(poster, 0.85),
  }
}

// Kept rectangle, expressed in the original image (for the preview).
export function keptRect(bitmap) {
  const c = defaultCrop(bitmap.width, bitmap.height)
  if (!c.isRotated) return { x: c.left, y: c.top, w: c.width, h: c.height }
  // Frame rotated 90° clockwise: rotated (u, v) ↔ original (x = v, y = H − u).
  return { x: c.top, y: bitmap.height - c.left - c.width, w: c.height, h: c.width }
}

// Error raised by uploadTarget; `code` maps to the i18n key `errors.upload.<code>`.
export class UploadError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status }
}

export async function uploadTarget(target) {
  let res
  try {
    res = await fetch('/api/cibles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(target),
    })
  } catch {
    throw new UploadError('network')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new UploadError(body.code || 'unknown', res.status)
  return body
}
