import { defineConfig } from 'vite';

// In development the client runs on :3000 and proxies /api to the Express server, so the
// browser sees a single origin and the httpOnly refresh cookie works without CORS.
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  server: {
    port: 3000,
    proxy: { '/api': { target: apiTarget } },
  },
  preview: {
    port: 3000,
    proxy: { '/api': { target: apiTarget } },
  },
});
