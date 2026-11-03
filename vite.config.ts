import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// WebXR needs a secure origin even on the home network, so the dev server uses a self-signed
// certificate. `host: true` exposes it on the LAN, where a Quest can reach it.
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  server: { host: true, port: 8443, strictPort: true },
  preview: { host: true },
  build: { chunkSizeWarningLimit: 1200 },
});
