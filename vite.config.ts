import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = { '/api': 'http://127.0.0.1:3001' };

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: apiProxy,
    // Vite serves project files in development; keep backend files out of its file server.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**'] },
  },
  preview: { proxy: apiProxy },
});
