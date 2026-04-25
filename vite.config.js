import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.CODESPACES
  ? 'http://127.0.0.1:8000'
  : 'http://127.0.0.1/clinica-2demayo'

export default defineConfig({
  plugins: [react()],
  cacheDir: 'node_modules/.vite-sistema',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: {
      host: '127.0.0.1',
      clientPort: 5173,
      protocol: 'ws',
    },
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
          const normalizedId = id.split('\\').join('/');
          const getPackageChunkName = (moduleId) => {
            const marker = '/node_modules/';
            const idx = moduleId.indexOf(marker);
            if (idx === -1) return null;
            const rest = moduleId.slice(idx + marker.length);
            if (!rest) return null;

            const parts = rest.split('/');
            if (!parts.length) return null;

            let pkg = parts[0];
            if (pkg.startsWith('@') && parts.length > 1) {
              pkg = `${pkg}-${parts[1]}`;
            }

            return `vendor-pkg-${pkg.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          };

          // Split heavy libs first; fallback to generic vendor.
          if (normalizedId.includes('node_modules/jspdf') || normalizedId.includes('node_modules/jspdf-autotable')) {
            return 'vendor-jspdf';
          }
          if (normalizedId.includes('node_modules/xlsx') || normalizedId.includes('node_modules/file-saver')) {
            return 'vendor-xlsx';
          }
          if (normalizedId.includes('node_modules/react/') || normalizedId.includes('node_modules/react-dom/') || normalizedId.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
          if (normalizedId.includes('node_modules/recharts')) {
            return 'vendor-recharts';
          }
          if (normalizedId.includes('node_modules/mathjs')) {
            return 'vendor-mathjs';
          }
          if (normalizedId.includes('node_modules/@fluentui') || normalizedId.includes('node_modules/react-icons')) {
            return 'vendor-ui';
          }
          if (normalizedId.includes('node_modules/@cornerstonejs') || normalizedId.includes('node_modules/cornerstone-') || normalizedId.includes('node_modules/dicom-parser')) {
            return 'vendor-dicom';
          }
          if (normalizedId.includes('node_modules/sweetalert2') || normalizedId.includes('node_modules/sweetalert2-react-content')) {
            return 'vendor-alerts';
          }

          if (normalizedId.includes('node_modules')) {
            return getPackageChunkName(normalizedId) || 'vendor';
          }
          if (normalizedId.includes('src/pages/ExamenesLaboratorioCrudPage.jsx')) return 'examenes-laboratorio-crud';
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
