import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://127.0.0.1:4000',
      '/users': 'http://127.0.0.1:4000',
      '/teams': 'http://127.0.0.1:4000',
      '/board': 'http://127.0.0.1:4000',
      '/health': 'http://127.0.0.1:4000',
    },
  },
});
