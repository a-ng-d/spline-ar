// Aperçu des liens partagés (WhatsApp, Slack, mail…) : ces services ne lancent pas le
// JavaScript de la page, ils lisent le HTML. On y écrit donc le titre du musée ou du
// filtre (<title> + balises Open Graph) à partir du lien.

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export default async (request, context) => {
  const url = new URL(request.url)
  const res = await context.next()
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res

  const q = url.searchParams
  const title = (q.get('t') || '').slice(0, 80)
  const isFace = url.pathname.startsWith('/visage')
  const count = q.getAll('o').length || (q.has('target') || q.has('scene') ? 1 : 0)

  let kind, desc
  if (isFace) {
    kind = 'Filtre visage'
    desc = 'Un filtre visage en réalité augmentée : ouvre le lien sur ton téléphone et place ton visage face à l\'écran.'
  } else if (count > 1) {
    kind = `Musée · ${count} affiches`
    desc = `${count} affiches en réalité augmentée : ouvre le lien sur ton téléphone et vise une affiche pour voir sa 3D en sortir.`
  } else {
    kind = 'Affiche AR'
    desc = 'Une affiche en réalité augmentée : ouvre le lien sur ton téléphone et vise l\'affiche pour voir la 3D en sortir.'
  }
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
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(full)}</title>\n  ${meta}`)

  const headers = new Headers(res.headers)
  headers.delete('content-length')
  return new Response(html, { status: res.status, headers })
}

export const config = { path: ['/', '/index.html', '/visage.html'] }
