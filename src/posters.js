// Poster gallery of a museum (/musee/affiches): shows the images to aim at on a screen, full
// screen on click, arrow keys to switch. ?a=<id>&a=<id>… or ?target=<id>; demo poster otherwise.
import { posterUrl } from './shared.js'
import { startBackground } from './background.js'
import { mountNav } from './nav.js'
import { initI18n, setText } from './i18n.js'

startBackground(document.getElementById('bg-canvas'))
await initI18n()
mountNav()

const p = new URLSearchParams(location.search)
const ids = p.getAll('a').length ? p.getAll('a') : [p.get('target')]
const srcs = ids.map(posterUrl)
const full = document.getElementById('full'), fullImg = full.querySelector('img')
let current = 0
const open = i => { current = (i + srcs.length) % srcs.length; fullImg.src = srcs[current]; full.classList.add('visible') }
full.onclick = () => full.classList.remove('visible')
addEventListener('keydown', e => {
  if (!full.classList.contains('visible')) return
  if (e.key === 'ArrowRight') open(current + 1)
  if (e.key === 'ArrowLeft') open(current - 1)
  if (e.key === 'Escape') full.classList.remove('visible')
})

if (p.get('t')) {
  const title = document.getElementById('title')
  delete title.dataset.i18nHtml // a museum title replaces the generic one
  title.textContent = p.get('t')
}

const grid = document.getElementById('grid')
srcs.forEach((src, i) => {
  const tile = document.createElement('div')
  tile.className = 'tile'
  const img = document.createElement('img'); img.alt = ''; img.src = src
  const label = document.createElement('span')
  setText(label, 'posters.tile', { n: i + 1 })
  tile.append(img, label)
  tile.onclick = () => open(i)
  grid.appendChild(tile)
})
if (srcs.length === 1) open(0)
