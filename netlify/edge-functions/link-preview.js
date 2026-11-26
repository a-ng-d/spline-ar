// Previews of shared links (WhatsApp, Slack, e-mail…): those services do not run the
// page's JavaScript, they read the HTML. So the preview tags (<title>, description, Open
// Graph, Twitter) are written into the HTML before it is sent, in English or French
// depending on Accept-Language:
//   - every page: the preview image in that language (og-default.jpg / og-default-fr.jpg)
//     and the page's title and description;
//   - museum and filter links: the title and kind of experience, from the link.
// The strings mirror locales/*.json (pageTitle keys).

const STRINGS = {
  en: {
    image: '/og-default.jpg',
    pages: {
      '/': 'Spline AR – your 3D out of the frame',
      '/creer': 'Spline AR – Create',
      '/creer/musee': 'Spline AR – Create a museum',
      '/creer/filtre': 'Spline AR – Create a face filter',
      '/musee/affiches': 'Spline AR – Posters',
    },
    description: 'Bring your Spline scenes out of a poster, or wear them on your face, with a simple link. Open-source WebAR for students.',
    filter: 'Face filter',
    filterDesc: 'An augmented reality face filter: open the link on your phone and face the screen.',
    museum: n => `Museum · ${n} posters`,
    museumDesc: n => `${n} augmented reality posters: open the link on your phone and aim at a poster to see its 3D come out.`,
    poster: 'AR poster',
    posterDesc: 'An augmented reality poster: open the link on your phone and aim at the poster to see the 3D come out.',
  },
  fr: {
    image: '/og-default-fr.jpg',
    pages: {
      '/': 'Spline AR – ta 3D hors du cadre',
      '/creer': 'Spline AR – Créer',
      '/creer/musee': 'Spline AR – Créer un musée',
      '/creer/filtre': 'Spline AR – Créer un filtre visage',
      '/musee/affiches': 'Spline AR – Affiches',
    },
    description: 'Fais sortir tes scènes Spline d\'une affiche, ou porte-les sur ton visage, avec un simple lien. WebAR open source pour les étudiants.',
    filter: 'Filtre visage',
    filterDesc: 'Un filtre visage en réalité augmentée : ouvre le lien sur ton téléphone et place ton visage face à l\'écran.',
    museum: n => `Musée · ${n} affiches`,
    museumDesc: n => `${n} affiches en réalité augmentée : ouvre le lien sur ton téléphone et vise une affiche pour voir sa 3D en sortir.`,
    poster: 'Affiche AR',
    posterDesc: 'Une affiche en réalité augmentée : ouvre le lien sur ton téléphone et vise l\'affiche pour voir la 3D en sortir.',
  },
}

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function pickLanguage(header) {
  const langs = (header || '').toLowerCase().split(',').map(s => s.trim().slice(0, 2))
  return langs.find(l => STRINGS[l]) || 'en'
}

// Replaces a meta tag's content, or adds the tag after <title> if the page has none
function setMeta(html, key, value) {
  const attr = key.startsWith('og:') ? 'property' : 'name'
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`)
  if (re.test(html)) return html.replace(re, `$1${esc(value)}$2`)
  return html.replace(/(<title[^>]*>[^<]*<\/title>)/, `$1\n  <meta ${attr}="${key}" content="${esc(value)}" />`)
}

const normalise = path => (path.replace(/\/index\.html$/, '/').replace(/\/+$/, '') || '/')

// Title, description and full <title> for a request
export function describe(url, lang) {
  const s = STRINGS[lang] ?? STRINGS.en
  const path = normalise(url.pathname)
  if (path === '/musee' || path === '/filtre') {
    const q = url.searchParams
    const title = (q.get('t') || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const count = q.getAll('o').length || (q.has('target') || q.has('scene') ? 1 : 0)
    let kind, desc
    if (path === '/filtre') { kind = s.filter; desc = s.filterDesc }
    else if (count > 1) { kind = s.museum(count); desc = s.museumDesc(count) }
    else { kind = s.poster; desc = s.posterDesc }
    return { ogTitle: title ? `${title} – ${kind}` : kind, desc, pageTitle: `${title || kind} – Spline AR` }
  }
  const pageTitle = s.pages[path] ?? 'Spline AR'
  return { ogTitle: pageTitle, desc: s.description, pageTitle }
}

export function rewrite(html, url, lang) {
  const s = STRINGS[lang] ?? STRINGS.en
  const { ogTitle, desc, pageTitle } = describe(url, lang)
  const image = `${url.origin}${s.image}`
  let out = html.replace(/(<title[^>]*>)[^<]*(<\/title>)/, `$1${esc(pageTitle)}$2`)
  const tags = {
    'description': desc,
    'og:title': ogTitle,
    'og:description': desc,
    'og:url': url.href,
    'og:image': image,
    'og:locale': lang === 'fr' ? 'fr_FR' : 'en_US',
    'twitter:card': 'summary_large_image',
    'twitter:image': image,
  }
  for (const [key, value] of Object.entries(tags)) out = setMeta(out, key, value)
  return out
}

export default async (request, context) => {
  const url = new URL(request.url)
  const res = await context.next()
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res

  const lang = pickLanguage(request.headers.get('accept-language'))
  const html = rewrite(await res.text(), url, lang)
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.append('vary', 'Accept-Language')
  return new Response(html, { status: res.status, headers })
}

export const config = {
  path: ['/', '/index.html', '/musee', '/musee/*', '/filtre', '/filtre/*', '/creer', '/creer/*'],
  excludedPath: ['/musee/affiches/*.jpg', '/musee/affiches/*.png'],
}
