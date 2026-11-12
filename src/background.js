// Animated background shared with SplineXR: 4 radial-gradient orbs drifting slowly.
// Returns a stop function (the background is turned off when the camera takes over).
export function startBackground(canvas) {
  if (!canvas) return () => {}
  const ctx = canvas.getContext('2d')
  let t = 0
  let raf = 0
  const orbs = Array.from({ length: 4 }, (_, i) => ({
    x: 0.2 + i * 0.2, y: 0.3 + (i % 2) * 0.4,
    r: 180 + i * 60, hue: [250, 190, 280, 160][i],
    speed: 0.0003 + i * 0.0001, phase: i * 1.3,
  }))
  const draw = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    t += 1
    orbs.forEach(o => {
      const cx = (o.x + Math.sin(t * o.speed + o.phase) * 0.08) * canvas.width
      const cy = (o.y + Math.cos(t * o.speed * 0.7 + o.phase) * 0.06) * canvas.height
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, o.r)
      g.addColorStop(0, `hsla(${o.hue},70%,55%,0.12)`)
      g.addColorStop(1, `hsla(${o.hue},70%,55%,0)`)
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(cx, cy, o.r, 0, Math.PI * 2); ctx.fill()
    })
    raf = requestAnimationFrame(draw)
  }
  draw()
  return () => { cancelAnimationFrame(raf); canvas.style.display = 'none' }
}
