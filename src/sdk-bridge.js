// ═══════════════════════════════════════════════════════════════════════════════
// SDK Bridge — loads Shelby + Aptos ESM packages and exposes them as globals
//
// This module is loaded via <script type="module"> in index.html.
// It runs after Vite processes the npm imports and makes the SDK
// available to the existing vanilla JS scripts through window._ShelbySDK.
//
// It also initializes the Aptos Wallet Adapter (AIP-62 Wallet Standard)
// and exposes it via window._AptosWalletAdapter for use by aptos-service.js.
//
// The existing script tags (shelby-service.js, app.js, etc.) remain as
// regular scripts. They access the SDK/adapter via globals at call-time
// (not at load-time), so the deferred module execution is safe.
// ═══════════════════════════════════════════════════════════════════════════════

import { Buffer } from 'buffer';

// Polyfill Buffer for browser (Shelby SDK uses it for file encoding)
if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = Buffer;
}

// ─── Aptos Wallet Adapter (AIP-62 Wallet Standard) ───────────────────────────
// This replaces all direct window.aptos / window.petra usage.
// WalletCore handles wallet discovery via the Wallet Standard protocol.
import { WalletCore } from '@aptos-labs/wallet-adapter-core';

try {
  // Create the wallet adapter — discovers Petra (and any other AIP-62 wallets)
  // optInWallets: list of wallet names to discover via the standard
  // dappConfig: configure network to ensure wallets connect to testnet
  const walletAdapter = new WalletCore(
    ['Petra'],           // optInWallets: wallets we want to discover
    { network: 'testnet' }, // dappConfig: hint wallets to use testnet
    true                 // disableTelemetry
  );

  window._AptosWalletAdapter = walletAdapter;

  console.log('[SDK Bridge] ✓ Aptos Wallet Adapter initialized');
  console.log('[SDK Bridge]   Discovered wallets:', walletAdapter.wallets.map(w => w.name));
} catch (err) {
  console.warn('[SDK Bridge] ✗ Failed to init Wallet Adapter:', err.message);
  window._AptosWalletAdapter = null;
}

// ─── WASM URL Override Hack ────────────────────────────────────────────────────
// Vite's development server and esbuild optimizer often resolve import.meta.url
// incorrectly for third-party WASM files, resulting in 404s or SPA fallback HTML
// ("expected magic word 00 61 73 6d, found 3c 21 44 4f" error).
// We copy clay.wasm to /public/clay.wasm and intercept the fetch call here.
const rawFetch = window.fetch;
window.fetch = async function(resource, init) {
  let urlStr = typeof resource === 'string' ? resource : (resource instanceof Request ? resource.url : (resource && resource.href || ''));
  if (urlStr.includes('clay.wasm')) {
    console.log(`[SDK Bridge] Redirecting WASM fetch: ${urlStr} -> /clay.wasm`);
    resource = '/clay.wasm';
  }
  return rawFetch.call(this, resource, init);
};

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
      AccountAddress: aptosSdk.AccountAddress,

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
