// ═══════════════════════════════════════════════════════════════════════════════
// SDK Bridge — loads Shelby + Aptos ESM packages and exposes them as globals
//
// This module is loaded via <script type="module"> in index.html.
// It runs after Vite processes the npm imports and makes the SDK
// available to the existing vanilla JS scripts through window._ShelbySDK.
//
// The existing script tags (shelby-service.js, app.js, etc.) remain as
// regular scripts. They access the SDK via window._ShelbySDK at call-time
// (not at load-time), so the deferred module execution is safe.
// ═══════════════════════════════════════════════════════════════════════════════

import { Buffer } from 'buffer';

// Polyfill Buffer for browser (Shelby SDK uses it for file encoding)
if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = Buffer;
}

// ─── Dynamic SDK Loading ─────────────────────────────────────────────────────
// We load the SDK asynchronously to avoid blocking page render if packages
// are not installed or fail to load. shelby-service.js checks for readiness
// before using any SDK functions.

async function loadShelbySDK() {
  try {
    const [shelbyBrowser, aptosSdk] = await Promise.all([
      import('@shelby-protocol/sdk/browser'),
      import('@aptos-labs/ts-sdk'),
    ]);

    window._ShelbySDK = {
      // Shelby client (browser variant)
      ShelbyClient: shelbyBrowser.ShelbyClient,
      ShelbyBlobClient: shelbyBrowser.ShelbyBlobClient,

      // Encoding utilities (erasure coding + commitments)
      createDefaultErasureCodingProvider: shelbyBrowser.createDefaultErasureCodingProvider,
      generateCommitments: shelbyBrowser.generateCommitments,
      expectedTotalChunksets: shelbyBrowser.expectedTotalChunksets,

      // Aptos SDK types
      Network: aptosSdk.Network,
      Aptos: aptosSdk.Aptos,
      AptosConfig: aptosSdk.AptosConfig,

      // Status
      ready: true,
    };

    console.log('[SDK Bridge] ✓ Shelby Protocol SDK loaded successfully');
  } catch (err) {
    console.warn('[SDK Bridge] ✗ Failed to load Shelby SDK:', err.message);
    console.warn('[SDK Bridge]   Real Shelby uploads will not work. Mock mode remains available.');

    window._ShelbySDK = {
      ready: false,
      error: err.message,
    };
  }
}

// ─── Expose Vite environment variables ───────────────────────────────────────
// Regular scripts can't use import.meta.env, so we bridge them here.
window._VITE_ENV = {
  SHELBY_API_KEY: import.meta.env.VITE_SHELBY_API_KEY || '',
  APTOS_API_KEY: import.meta.env.VITE_APTOS_API_KEY || '',
};

// Start loading
loadShelbySDK();
