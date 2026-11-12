// Home page: "Get started" (templates) and "My creations", always both.
import { startBackground } from './background.js'
import { renderWorks } from './works-ui.js'
import { describe, TYPES } from './works.js'
import { TEMPLATES, TYPE_MUSEUM, TYPE_FILTER, galleryLink, readItems } from './shared.js'
import { initI18n, t, setText, onLanguageChange, mountLanguageSwitch } from './i18n.js'

startBackground(document.getElementById('bg-canvas'))
await initI18n()
mountLanguageSwitch(document.getElementById('lang-slot'))

const $ = id => document.getElementById(id)

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}
function elKey(tag, cls, key) {
  const e = el(tag, cls)
  setText(e, key)
  return e
}

// Templates: same rows as "My creations", with Play / Posters / Edit (a copy). The title is
// written in the current language, so the shared link carries it too.
function renderTemplates() {
  const container = $('templates')
  container.replaceChildren()
  for (const tpl of TEMPLATES) {
    const search = `t=${encodeURIComponent(t(tpl.titleKey))}&${tpl.search}`
    const d = describe({ type: tpl.type, search, id: '' })
    const row = el('div', 'work')
    const thumb = el('div', 'work-thumb' + (tpl.type === TYPE_FILTER ? ' face' : ''))
    if (d.thumb) { const img = el('img'); img.src = d.thumb; img.alt = ''; thumb.append(img) }
    else thumb.textContent = '☺'
    const info = el('div', 'work-info')
    info.append(el('div', 'work-title', d.title))
    info.append(el('div', 'work-meta', [t(TYPES[tpl.type].labelKey), d.detail].filter(Boolean).join(' · ')))
    const actions = el('div', 'work-actions')
    const play = elKey('a', 'btn btn-sm btn-ghost', 'actions.play'); play.href = d.link
    actions.append(play)
    if (tpl.type === TYPE_MUSEUM) {
      const posters = elKey('a', 'btn btn-sm btn-ghost', 'home.posters')
      posters.href = galleryLink(location.origin, readItems('?' + search))
      posters.dataset.i18nTitle = 'home.postersTitle'
      posters.title = t('home.postersTitle')
      actions.append(posters)
    }
    const copy = elKey('a', 'btn btn-sm btn-ghost', 'actions.edit')
    copy.href = `${TYPES[tpl.type].editor}?${search}`
    copy.dataset.i18nTitle = 'home.copyTitle'
    copy.title = t('home.copyTitle')
    actions.append(copy)
    row.append(thumb, info, actions)
    container.append(row)
  }
}
renderTemplates()
onLanguageChange(renderTemplates)

renderWorks($('works'), {
  emptyKey: 'home.worksEmpty',
  onDraw: count => {
    $('count').hidden = !count
    $('count').textContent = count
    setText($('list-help'), count ? 'works.note' : '')
  },
})
