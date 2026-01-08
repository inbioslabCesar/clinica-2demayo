import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'public-site',
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: '../dist-public',
    emptyOutDir: true,
  },
})
