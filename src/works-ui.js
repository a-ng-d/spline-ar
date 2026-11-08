// Interface « Mes créations » : liste réutilisable + tiroir latéral ouvert depuis la barre de navigation.
import { listWorks, describe, deleteWork, timeAgo, onWorksChanged, TYPES } from './works.js'

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

// Remplit `container` avec la liste ; `currentId` = création ouverte dans l'éditeur.
export function renderWorks(container, { currentId = null, emptyText, onEmpty, onDraw } = {}) {
  const draw = () => {
    const cur = typeof currentId === 'function' ? currentId() : currentId
    const works = listWorks()
    container.replaceChildren()
    onDraw?.(works.length)
    if (!works.length && onEmpty) { onEmpty(container); return }
    if (!works.length) {
      container.append(el('p', 'help works-empty', emptyText ||
        'Rien pour l\'instant. Tes musées et filtres apparaîtront ici dès que tu crées leur lien.'))
      return
    }
    for (const w of works) {
      const d = describe(w)
      const row = el('div', 'work' + (w.id === cur ? ' current' : ''))
      const thumb = el('div', 'work-thumb' + (w.type === 'filtre' ? ' face' : ''))
      if (d.thumb) { const img = el('img'); img.src = d.thumb; img.alt = ''; img.loading = 'lazy'; thumb.append(img) }
      else thumb.textContent = '☺'
      const info = el('div', 'work-info')
      info.append(el('div', 'work-title', d.title))
      info.append(el('div', 'work-meta', `${TYPES[w.type].label} · ${d.detail === TYPES[w.type].label ? '' : d.detail + ' · '}${timeAgo(w.updatedAt)}`))
      const actions = el('div', 'work-actions')
      const edit = el('a', 'btn btn-sm btn-ghost', w.id === cur ? 'Ouverte' : 'Modifier')
      edit.href = d.edit
      if (w.id === cur) edit.classList.add('is-current')
      const open = el('a', 'btn btn-sm btn-ghost', 'Jouer')
      open.href = d.link; open.target = '_blank'; open.rel = 'noopener'
      const del = el('button', 'btn btn-sm btn-danger', '✕')
      del.title = 'Supprimer de mes créations'
      del.onclick = () => {
        if (confirm(`Supprimer « ${d.title} » de tes créations ?\nLe lien partagé continuera de marcher.`)) deleteWork(w.id)
      }
      actions.append(edit, open, del)
      row.append(thumb, info, actions)
      container.append(row)
    }
  }
  draw()
  onWorksChanged(draw)
  return draw
}

// Bouton « Mes créations (n) » dans la barre de navigation + tiroir latéral.
export function mountWorksDrawer({ currentId = null } = {}) {
  const nav = document.querySelector('.topnav')
  if (!nav) return
  const btn = el('button', 'works-btn')
  const count = () => { btn.textContent = `Mes créations (${listWorks().length})` }
  count(); onWorksChanged(count)

  const drawer = el('aside', 'drawer')
  const head = el('div', 'drawer-head')
  head.append(el('div', 'section-label', 'Mes créations'))
  const close = el('button', 'btn btn-sm btn-ghost', 'Fermer')
  head.append(close)
  const list = el('div', 'works')
  const foot = el('div', 'drawer-foot')
  const nm = el('a', 'btn btn-sm btn-ghost', '＋ Nouveau musée'); nm.href = '/creer/musee?nouveau=1'
  const nf = el('a', 'btn btn-sm btn-ghost', '＋ Nouveau filtre'); nf.href = '/creer/filtre?nouveau=1'
  foot.append(nm, nf)
  const note = el('p', 'help', 'Enregistrées dans ce navigateur. Le lien d\'une création sert aussi de sauvegarde : ouvre-le puis « Modifier ».')
  drawer.append(head, list, foot, note)
  const veil = el('div', 'drawer-veil')
  document.body.append(veil, drawer)
  renderWorks(list, { currentId })

  const toggle = open => { drawer.classList.toggle('open', open); veil.classList.toggle('open', open) }
  btn.onclick = () => toggle(true)
  close.onclick = veil.onclick = () => toggle(false)
  addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false) })
  nav.append(btn)
}
