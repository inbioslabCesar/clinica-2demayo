import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    proxy: {
      // Redirige todas las llamadas a /api_*.php al backend PHP en Laragon
      '/api_': {
        target: 'http://localhost/clinica-2demayo',
        changeOrigin: true,
        secure: false,
        // Opcional: reescribe la ruta si es necesario
        // rewrite: path => path.replace(/^\/api_/, '/api_')
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          if (id.includes('src/components/UsuarioList.jsx')) {
            return 'usuario-list';
          }
          if (id.includes('src/components/PacienteList.jsx')) {
            return 'paciente-list';
          }
          if (id.includes('src/pages/ExamenesLaboratorioCrudPage.jsx')) {
            return 'examenes-laboratorio-crud';
          }
          return undefined;
        }
      }
    }
  }
})
