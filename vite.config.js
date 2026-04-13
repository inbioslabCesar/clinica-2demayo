import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.CODESPACES
  ? 'http://127.0.0.1:8000'
  : 'http://localhost/clinica-2demayo'

export default defineConfig({
  plugins: [react()],
  cacheDir: 'node_modules/.vite-sistema',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api_': {
        target: apiProxyTarget,
        // Keep original host (e.g. *.devtunnels.ms) so PHP emits a valid session cookie domain.
        changeOrigin: false,
        secure: false,
      }
    }
  },
  optimizeDeps: {
    include: [
      '@fluentui/react',
      'react-router-dom',
      'axios',
      'react-icons/fa',
      'react-icons/fi',
      'react-calendar',
      'react-to-print',
      'recharts',
      'mathjs',
      'xlsx',
      'jspdf',
      'jspdf-autotable',
      'file-saver',
      'sweetalert2',
      'sweetalert2-react-content',
      'dicom-parser'
      // Agrega aquí dependencias que usas en casi todas las páginas
    ],
    exclude: [
      // Si tienes dependencias pesadas que solo usas en lazy, exclúyelas aquí
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
          if (id.includes('src/pages/ExamenesLaboratorioCrudPage.jsx')) return 'examenes-laboratorio-crud';
          // Agrega aquí solo páginas grandes
          return undefined;
        }
      }
    }
  },
  watch: {
    ignored: ['**/tests/**', '**/docs/**']
  }
})
