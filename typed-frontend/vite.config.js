import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Proxy API requests to the backend in development.
    // Avoids CORS issues and simulates production routing.
    proxy: {
      '/api': {
        target: 'http://localhost:4012',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Produção: gera sourcemaps para debug mas sem expor source code.
    sourcemap: false,
  },
});
