import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev server runs on 5173 to match the hris-web Keycloak client's redirect URIs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
