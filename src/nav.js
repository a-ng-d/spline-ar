// Navigation bar of the creation pages: Back button + breadcrumb + language switch.
// <nav class="topnav" data-trail="creer,musee"></nav>; the last step is the current page.
import { setText, mountLanguageSwitch } from './i18n.js'

const STEPS = {
  home: { labelKey: 'nav.home', href: '/' },
  creer: { labelKey: 'nav.create', href: '/creer' },
  musee: { labelKey: 'nav.museum', href: '/creer/musee' },
  filtre: { labelKey: 'nav.filter', href: '/creer/filtre' },
  affiches: { labelKey: 'nav.posters', href: null },
}

export function mountNav(nav = document.querySelector('.topnav')) {
  if (!nav) return
  const trail = ['home', ...(nav.dataset.trail || '').split(',').map(s => s.trim()).filter(Boolean)]
  const parent = STEPS[trail[trail.length - 2]] || STEPS.home

  const back = document.createElement('a')
  back.className = 'back-btn'
  setText(back, 'nav.back')
  back.href = parent.href
  // Go back to where we came from (previous page of this site), otherwise to the parent step.
  back.onclick = e => {
    const sameSite = document.referrer && new URL(document.referrer).origin === location.origin
    if (sameSite && history.length > 1) { e.preventDefault(); history.back() }
  }

  const crumbs = document.createElement('div')
  crumbs.className = 'crumbs'
  trail.forEach((key, i) => {
    const step = STEPS[key]
    if (i) { const sep = document.createElement('i'); sep.textContent = '›'; crumbs.append(sep) }
    if (i === trail.length - 1 || !step.href) {
      const cur = document.createElement('span')
      setText(cur, step.labelKey)
      if (i === trail.length - 1) cur.setAttribute('aria-current', 'page')
      crumbs.append(cur)
    } else {
      const a = document.createElement('a')
      a.href = step.href
      setText(a, step.labelKey)
      crumbs.append(a)
    }
  })
  nav.replaceChildren(back, crumbs)
  mountLanguageSwitch(nav)
}
