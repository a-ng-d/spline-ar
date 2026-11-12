// Previews of shared links (WhatsApp, Slack, e-mail…): those services do not run the page's
// JavaScript, they read the HTML. So we write the museum or filter title (<title> + Open Graph
// tags) into the HTML from the link, in English or French depending on Accept-Language.
// The strings mirror locales/*.json (keys preview.*).

const STRINGS = {
  en: {
    filter: 'Face filter',
    filterDesc: 'An augmented reality face filter: open the link on your phone and face the screen.',
    museum: n => `Museum · ${n} posters`,
    museumDesc: n => `${n} augmented reality posters: open the link on your phone and aim at a poster to see its 3D come out.`,
    poster: 'AR poster',
    posterDesc: 'An augmented reality poster: open the link on your phone and aim at the poster to see the 3D come out.',
  },
  fr: {
    filter: 'Filtre visage',
    filterDesc: 'Un filtre visage en réalité augmentée : ouvre le lien sur ton téléphone et place ton visage face à l\'écran.',
    museum: n => `Musée · ${n} affiches`,
    museumDesc: n => `${n} affiches en réalité augmentée : ouvre le lien sur ton téléphone et vise une affiche pour voir sa 3D en sortir.`,
    poster: 'Affiche AR',
    posterDesc: 'Une affiche en réalité augmentée : ouvre le lien sur ton téléphone et vise l\'affiche pour voir la 3D en sortir.',
  },
}

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function pickLanguage(header) {
  const langs = (header || '').toLowerCase().split(',').map(s => s.trim().slice(0, 2))
  return langs.find(l => STRINGS[l]) || 'en'
}

export default async (request, context) => {
  const url = new URL(request.url)
  const res = await context.next()
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res

  const s = STRINGS[pickLanguage(request.headers.get('accept-language'))]
  const q = url.searchParams
  const title = (q.get('t') || '').slice(0, 80)
  const isFilter = url.pathname.startsWith('/filtre') // otherwise /musee
  const count = q.getAll('o').length || (q.has('target') || q.has('scene') ? 1 : 0)

  let kind, desc
  if (isFilter) { kind = s.filter; desc = s.filterDesc }
  else if (count > 1) { kind = s.museum(count); desc = s.museumDesc(count) }
  else { kind = s.poster; desc = s.posterDesc }
  const full = `${title || kind} · Spline AR`

  const meta = [
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title ? `${title} — ${kind}` : kind)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url.href)}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ].join('\n  ')

  const html = (await res.text())
    .replace(/<title[^>]*>[^<]*<\/title>/, `<title>${esc(full)}</title>\n  ${meta}`)

  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.append('vary', 'Accept-Language')
  return new Response(html, { status: res.status, headers })
}

export const config = { path: ['/musee', '/musee/', '/filtre', '/filtre/'] }
