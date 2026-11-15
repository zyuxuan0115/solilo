import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/apps/solilo/',
  plugins: [
    react(),
    {
      name: 'solilo-dev-embed-alias',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/apps/solilo/embed.js' || req.url?.startsWith('/apps/solilo/embed.js?')) {
            req.url = req.url.replace('/apps/solilo/embed.js', '/apps/solilo/src/embed/solilo-timeline.ts')
          }
          next()
        })
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/apps/solilo/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        embed: resolve(import.meta.dirname, 'src/embed/solilo-timeline.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'embed' ? 'embed.js' : 'assets/[name]-[hash].js',
      },
    },
  },
})
