import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: { three: 'super-three' }
  },
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        creer: resolve(__dirname, 'creer.html'),
        affiche: resolve(__dirname, 'affiche.html'),
      },
    },
  },
})
