import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = `http://127.0.0.1:${Number(process.env.PORT || 3217)}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': target,
      '/files': target,
    },
  },
});
