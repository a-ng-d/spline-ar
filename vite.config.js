import { defineConfig } from 'vite'
import { resolve } from 'path'

// URLs without a trailing slash (/musee, /creer/filtre…) → their index.html, like the
// 200 rules of public/_redirects on Netlify. For `vite` and `vite preview`.
const PAGES = ['/musee', '/musee/affiches', '/filtre', '/creer', '/creer/musee', '/creer/filtre']
const prettyUrls = {
  name: 'pretty-urls',
  configureServer(server) { server.middlewares.use(rewrite) },
  configurePreviewServer(server) { server.middlewares.use(rewrite) },
}
function rewrite(req, _res, next) {
  const [path, query = ''] = req.url.split('?')
  if (PAGES.includes(path)) req.url = `${path}/index.html${query ? '?' + query : ''}`
  next()
}

export default defineConfig({
  plugins: [prettyUrls],
  resolve: {
    alias: { three: 'super-three' }
  },
  build: {
    target: 'es2022', // top-level await (i18n is loaded before the page renders)
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        museum: resolve(__dirname, 'musee/index.html'),
        filter: resolve(__dirname, 'filtre/index.html'),
        create: resolve(__dirname, 'creer/index.html'),
        createMuseum: resolve(__dirname, 'creer/musee/index.html'),
        createFilter: resolve(__dirname, 'creer/filtre/index.html'),
        posters: resolve(__dirname, 'musee/affiches/index.html'),
      },
    },
  },
})
