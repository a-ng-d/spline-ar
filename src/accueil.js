// Accueil : « Pour commencer » (modèles) et « Mes créations », toujours les deux.
import { startBackground } from './background.js'
import { renderWorks } from './works-ui.js'
import { describe, TYPES } from './works.js'
import { EXAMPLES, galleryLink, readItems } from './shared.js'

startBackground(document.getElementById('bg-canvas'))

const $ = id => document.getElementById(id)

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

// Modèles : mêmes lignes que « Mes créations », avec Jouer / Affiches / Copier dans mes créations.
function renderExamples(container) {
  for (const ex of EXAMPLES) {
    const d = describe({ ...ex, id: '' })
    const row = el('div', 'work')
    const thumb = el('div', 'work-thumb' + (ex.type === 'filtre' ? ' face' : ''))
    if (d.thumb) { const img = el('img'); img.src = d.thumb; img.alt = ''; thumb.append(img) }
    else thumb.textContent = '☺'
    const info = el('div', 'work-info')
    info.append(el('div', 'work-title', d.title))
    info.append(el('div', 'work-meta', ex.type === 'musee' ? `Musée · ${d.detail}` : 'Filtre visage'))
    const actions = el('div', 'work-actions')
    const play = el('a', 'btn btn-sm btn-ghost', 'Jouer'); play.href = d.link
    actions.append(play)
    if (ex.type === 'musee') {
      const posters = el('a', 'btn btn-sm btn-ghost', 'Affiches')
      posters.href = galleryLink(location.origin, readItems('?' + ex.search))
      posters.title = 'Afficher les affiches à viser'
      actions.append(posters)
    }
    const copy = el('a', 'btn btn-sm btn-ghost', 'Modifier')
    copy.href = `${TYPES[ex.type].editor}?${ex.search}`
    copy.title = 'Ouvrir une copie dans l\'éditeur'
    actions.append(copy)
    row.append(thumb, info, actions)
    container.append(row)
  }
}

renderExamples($('examples'))

renderWorks($('works'), {
  emptyText: 'Rien pour l\'instant. Crée un musée ou un filtre, ou pars d\'un modèle avec « Modifier » : tes créations apparaîtront ici.',
  onDraw: count => {
    $('count').hidden = !count
    $('count').textContent = count
    $('list-help').textContent = count
      ? 'Enregistrées dans ce navigateur. Le lien d\'une création sert aussi de sauvegarde : ouvre-le, puis « Modifier ».'
      : ''
  },
})
