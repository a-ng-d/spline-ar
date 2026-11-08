// Barre de navigation des pages de création : bouton Retour + fil d'Ariane.
// <nav class="topnav" data-trail="creer,musee"></nav> ; la dernière étape est la page courante.
const STEPS = {
  accueil: { label: 'Accueil', href: '/' },
  creer: { label: 'Créer', href: '/creer' },
  musee: { label: 'Musée', href: '/creer/musee' },
  filtre: { label: 'Filtre visage', href: '/creer/filtre' },
  affiches: { label: 'Affiches', href: null },
}

export function mountNav(nav = document.querySelector('.topnav')) {
  if (!nav) return
  const trail = ['accueil', ...nav.dataset.trail.split(',').map(s => s.trim()).filter(Boolean)]
  const parent = STEPS[trail[trail.length - 2]]

  const back = document.createElement('a')
  back.className = 'back-btn'
  back.textContent = '← Retour'
  back.href = parent.href
  // Revenir là où l'on était (page précédente du site), sinon à l'étape parente.
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
      cur.textContent = step.label
      if (i === trail.length - 1) cur.setAttribute('aria-current', 'page')
      crumbs.append(cur)
    } else {
      const a = document.createElement('a'); a.href = step.href; a.textContent = step.label
      crumbs.append(a)
    }
  })
  nav.replaceChildren(back, crumbs)
}

mountNav()
