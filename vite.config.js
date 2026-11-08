import { defineConfig } from 'vite'
import { resolve } from 'path'

// Adresses sans barre finale (/musee, /creer/filtre…) → leur index.html, comme les
// règles 200 de public/_redirects sur Netlify. Pour `vite` et `vite preview`.
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
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        accueil: resolve(__dirname, 'index.html'),
        musee: resolve(__dirname, 'musee/index.html'),
        filtre: resolve(__dirname, 'filtre/index.html'),
        creer: resolve(__dirname, 'creer/index.html'),
        creerMusee: resolve(__dirname, 'creer/musee/index.html'),
        creerFiltre: resolve(__dirname, 'creer/filtre/index.html'),
        affiches: resolve(__dirname, 'musee/affiches/index.html'),
      },
    },
  },
})
