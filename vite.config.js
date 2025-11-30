import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api_': {
        target: 'http://localhost/clinica-2demayo',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  optimizeDeps: {
    include: [
      '@fluentui/react',
      'react-router-dom'
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
