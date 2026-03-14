import { defineConfig } from 'vite';

export default defineConfig({
  // Serve from project root (index.html is here)
  root: '.',

  server: {
    port: 5173,
    open: true,
  },

  build: {
    outDir: 'dist',
    // Ensure non-module scripts in index.html are included in build
    rollupOptions: {
      input: 'index.html',
    },
  },

  // Make env vars starting with VITE_ available via import.meta.env
  envPrefix: 'VITE_',
});
