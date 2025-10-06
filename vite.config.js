import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
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
