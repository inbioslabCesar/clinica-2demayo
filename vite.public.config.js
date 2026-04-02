import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'public-site',
  base: './',
  plugins: [react()],
  cacheDir: 'node_modules/.vite-public',
  server: {
    host: true,
    port: 5174,
    strictPort: true,
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
