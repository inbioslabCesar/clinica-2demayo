import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'public-site',
  base: './',
  plugins: [react()],
  cacheDir: 'node_modules/.vite-public',
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    hmr: {
      host: '127.0.0.1',
      clientPort: 5174,
      protocol: 'ws',
    },
  },
  optimizeDeps: {
    include: [
      'react-router-dom',
      'react-icons/fa'
    ]
  },
  build: {
    outDir: '../dist-public',
    emptyOutDir: true,
  },
})
