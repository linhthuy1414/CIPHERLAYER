import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─── Copy vanilla (non-module) scripts to dist/ on build ─────────────────────
// Vite only bundles <script type="module"> tags. Our vanilla <script> tags
// reference files in the project root that must exist at the same paths
// in the production build output. This plugin copies them into dist/.
function copyVanillaScripts() {
  const scripts = [
    'matrix.js',
    'testnet-config.js',
    'vault-utils.js',
    'wallet-utils.js',
    'aptos-service.js',
    'shelby-service.js',
    'app.js',
  ];

  return {
    name: 'copy-vanilla-scripts',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

      for (const file of scripts) {
        const src = resolve(__dirname, file);
        const dest = resolve(outDir, file);
        if (existsSync(src)) {
          copyFileSync(src, dest);
          console.log(`  [copy-vanilla-scripts] ✓ ${file}`);
        } else {
          console.warn(`  [copy-vanilla-scripts] ✗ ${file} not found, skipped`);
        }
      }
    },
  };
}

export default defineConfig({
  // Serve from project root (index.html is here)
  root: '.',

  server: {
    port: 5173,
    open: true,
  },

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },

  optimizeDeps: {
    exclude: ['@shelby-protocol/sdk', '@shelby-protocol/clay-codes']
  },

  // Make env vars starting with VITE_ available via import.meta.env
  envPrefix: 'VITE_',

  plugins: [copyVanillaScripts()],
});
