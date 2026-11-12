// "My creations" UI: reusable list + side drawer opened from the navigation bar.
import { listWorks, describe, deleteWork, timeAgo, onWorksChanged, TYPES } from './works.js'
import { t, setText, onLanguageChange } from './i18n.js'
import { TYPE_FILTER } from './shared.js'

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}
// Element whose text is an i18n key (re-translated on language switch).
function elKey(tag, cls, key, params) {
  const e = el(tag, cls)
  setText(e, key, params)
  return e
}

// Fills `container` with the list; `currentId` = creation open in the editor (value or getter).
export function renderWorks(container, { currentId = null, emptyKey = 'works.empty', onEmpty, onDraw } = {}) {
  const draw = () => {
    const cur = typeof currentId === 'function' ? currentId() : currentId
    const works = listWorks()
    container.replaceChildren()
    onDraw?.(works.length)
    if (!works.length && onEmpty) { onEmpty(container); return }
    if (!works.length) {
      container.append(elKey('p', 'help works-empty', emptyKey))
      return
    }
    for (const w of works) {
      const d = describe(w)
      const row = el('div', 'work' + (w.id === cur ? ' current' : ''))
      const thumb = el('div', 'work-thumb' + (w.type === TYPE_FILTER ? ' face' : ''))
      if (d.thumb) { const img = el('img'); img.src = d.thumb; img.alt = ''; img.loading = 'lazy'; thumb.append(img) }
      else thumb.textContent = '☺'
      const info = el('div', 'work-info')
      info.append(el('div', 'work-title', d.title))
      const meta = [t(TYPES[w.type].labelKey), d.detail, timeAgo(w.updatedAt)].filter(Boolean).join(' · ')
      info.append(el('div', 'work-meta', meta))
      const actions = el('div', 'work-actions')
      const edit = elKey('a', 'btn btn-sm btn-ghost', w.id === cur ? 'works.opened' : 'actions.edit')
      edit.href = d.edit
      if (w.id === cur) edit.classList.add('is-current')
      const open = elKey('a', 'btn btn-sm btn-ghost', 'actions.play')
      open.href = d.link; open.target = '_blank'; open.rel = 'noopener'
      const del = el('button', 'btn btn-sm btn-danger', '✕')
      del.dataset.i18nTitle = 'works.delete'
      del.title = t('works.delete')
      del.onclick = () => {
        if (confirm(t('works.confirmDelete', { title: d.title }))) deleteWork(w.id)
      }
      actions.append(edit, open, del)
      row.append(thumb, info, actions)
      container.append(row)
    }
  }
  draw()
  onWorksChanged(draw)
  onLanguageChange(draw)
  return draw
}

// "My creations (n)" button in the navigation bar + side drawer.
export function mountWorksDrawer({ currentId = null } = {}) {
  const nav = document.querySelector('.topnav')
  if (!nav) return
  const btn = el('button', 'works-btn')
  const count = () => setText(btn, 'works.buttonCount', { n: listWorks().length })
  count(); onWorksChanged(count)

  const drawer = el('aside', 'drawer')
  const head = el('div', 'drawer-head')
  head.append(elKey('div', 'section-label', 'works.title'))
  const close = elKey('button', 'btn btn-sm btn-ghost', 'actions.close')
  head.append(close)
  const list = el('div', 'works')
  const foot = el('div', 'drawer-foot')
  const nm = elKey('a', 'btn btn-sm btn-ghost', 'works.newMuseum'); nm.href = '/creer/musee?nouveau=1'
  const nf = elKey('a', 'btn btn-sm btn-ghost', 'works.newFilter'); nf.href = '/creer/filtre?nouveau=1'
  foot.append(nm, nf)
  const note = elKey('p', 'help', 'works.note')
  drawer.append(head, list, foot, note)
  const veil = el('div', 'drawer-veil')
  document.body.append(veil, drawer)
  renderWorks(list, { currentId })

  const toggle = open => { drawer.classList.toggle('open', open); veil.classList.toggle('open', open) }
  btn.onclick = () => toggle(true)
  close.onclick = veil.onclick = () => toggle(false)
  addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false) })
  const langSwitch = nav.querySelector('.lang-switch')
  if (langSwitch) langSwitch.before(btn)
  else nav.append(btn)
}
