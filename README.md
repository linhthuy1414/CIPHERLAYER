# CipherLayer

A client-side AES-256-GCM encrypted secure file sharing application with complete Aptos Testnet wallet integration and live Shelby Testnet blob storage.

## Overview

CipherLayer encrypts files entirely in the browser using AES-256-GCM (via the Web Crypto API) before uploading them to the blockchain storage. Files are shared via a unique file ID paired with a local decryption key. It uses a hybrid local-first, blockchain-backed architecture.

The project natively integrates with the **Aptos Testnet** (for identity, AIP-62 wallet connection, and transaction signing) and the **Shelby Testnet** (for decentralized encrypted blob storage and ShelbyUSD payments). 

Unlike a scaffold, these integrations are fully functional.

## Current Status

### Functional Features

- **Vite Developer Server** — `npm install` → `npm run dev` starts the application locally.
- **Wallet Standard Integration (AIP-62)** — Replaces legacy `window.aptos` with `@aptos-labs/wallet-adapter-core` to discover and connect Petra securely.
- **AES-256-GCM Encryption** — Real client-side cryptography via the Web Crypto API using PBKDF2 (200k iterations).
- **Shelby API Configuration UI** — Direct in-app UI to input, save, and persist your `geomi.dev` API Key via `localStorage`, eliminating the strict dependency on `.env` modifications.
- **Explorer Tab (Replaces Inbox)** — Replaces the mock local Inbox with a live on-chain data fetcher that queries the Shelby Testnet for the connected wallet's blob history and real ShelbyUSD balances.
- **Real Aptos Testnet Integration** — Native transaction signing for blob registration (`::register_blob`) and APT gas payment validation.
- **Real Shelby Testnet Uploads** — Encrypted payloads are correctly Erasure Coded (.wasm compilation fixed) and pushed to the Shelby RPC.
- **Upload Readiness Validations** — Pre-upload checks verifying Wallet connection, signed sessions, APT gas balances, ShelbyUSD storage balances, and API Key existence.
- **Graceful Mock Fallbacks** — Easily switchable between REAL and MOCK modes via `testnet-config.js`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Core Architecture** | Vanilla HTML5, CSS3, JavaScript (ES6+, No React/Vue) |
| **Build Tooling** | Vite 6.x (Bundler, Dev Server, WASM Exclude Optimization) |
| **Cryptography** | Web Crypto API (AES-256-GCM, SHA-256, PBKDF2) |
| **Aptos Wallet Standard** | `@aptos-labs/wallet-adapter-core` (AIP-62 protocol) |
| **Aptos Blockchain** | `@aptos-labs/ts-sdk` |
| **Storage Protocol** | `@shelby-protocol/sdk` (Erasure coding WASM, RPC, Blob Client) |

## Project Structure

```
index.html          — Layout structure containing the Upload, Download, Vault, and Explorer tabs.
style.css           — Distinctive dark cyberpunk aesthetic (CSS custom properties).
app.js              — Core UI coordinator, tab routing, API key hook-ins, event rendering.
shelby-service.js   — Shelby SDK integration: Erasure coding, blobs upload, and Explorer blob fetching.
aptos-service.js    — Wallet connection states, Type casting, Transaction payload construction & submission.
testnet-config.js   — Central configuration for Testnet endpoints, feature flags, and fail-safes.
src/sdk-bridge.js   — ES Module bridge for loading NPM SDKs into Vanilla JS globals; contains the WASM fetch interceptor.
wallet-utils.js     — Local wallet-gated validations and session utilities.
vault-utils.js      — Helpers for localStorage history arrays, link generation, and panic wipes.
vite.config.js      — Vite bundler settings (explicit exclusion of Shelby SDK dependencies for proper loading).
```

## Getting Started

### Prerequisites

- Node.js (18+ recommended)
- **Petra Wallet** Browser Extension: Installed and set to the **Testnet** network.
- **Shelby API Key**: Required for file uploading. You can get one from [geomi.dev](https://geomi.dev).

### Install

```bash
cd CipherLayer
npm install
```

### Run Locally

```bash
npm run dev
```

The app will start at `http://localhost:5173`.

## Configuration

CipherLayer shifts configurations from hardcoded env variables directly into the browser memory where possible to improve DX. 

### Shelby API Key
You no longer need to strictly modify `.env`. 
1. Open the CipherLayer application (`localhost:5173`).
2. Navigate to the **Upload** tab.
3. In the "Shelby API Configuration" panel, inject your testnet API Key and click **Save**. This persists in your `localStorage`.

### Environment Variables (Optional)
You may still use `.env` for hardcoding or CI/CD deployments:
```env
VITE_SHELBY_API_KEY=your_key_here
VITE_APTOS_API_KEY=optional_indexer_key
```

### Mock Mode vs Real Mode
By default, the application is set to interact with the **Real Testnets**. If you want to fall back to the browser's `localStorage` for testing without interacting with a live blockchain or needing gas:
In `testnet-config.js`, change the feature flags:
```javascript
  FEATURE_FLAGS: {
    USE_REAL_SHELBY: false,
    USE_REAL_SHELBY_BALANCE: false,
    // ...
  }
```

## Usage Guide

### Upload Flow
1. Assure your Petra wallet is connected and the mode is `CONNECTED`.
2. Assure your Shelby API Key is verified and loaded.
3. Drag-and-drop your payload.
4. Select the Expiration and Access Policy limits.
5. Click **Encrypt & Create Secure Link**. 
   - The file will be client-side encrypted.
   - You will be prompted by Petra to sign the transaction.
   - The payload streams via the Shelby service to decentralized storage.

### Explorer Tab
The **Explorer** tab replaced the old localized `Inbox`. 
- Upon navigating to the Explorer tab, the application reads the connected Wallet Address. 
- It communicates via `ShelbyBlobClient` to pull all blobs registered to your account directly from the testnet Indexer.
- It also displays your live ShelbyUSD balance fetched from the Aptos blockchain.

## Troubleshooting

- **"WebAssembly.compile(): expected magic word 00 61 73 6d"**: This error is mitigated in this project by a `fetch` interceptor located in `src/sdk-bridge.js`. Ensure you are running via Vite, as it relies on serving `clay.wasm` from `public/`.
- **"Type Mismatch for argument 6" (Petra Error)**: Fixed by `aptos-service.js` automatically coercing integers/BigInts to Strings before transaction submission.
- **"401 Unauthorized" when loading the Explorer tab**: Your Shelby API Key in the Upload form is empty, incorrect, or corrupted. Please clear and re-save it.

## Security Notes

1. **Client-Side First**: Files are encrypted inside the DOM context before they reach any network interface or memory stream. Passphrases never leave the browser.
2. **Key Material**: Do not commit actual `.env` keys. Use the built-in UI Configuration panel on the frontend for sandbox testing.
3. **Wallet Auth**: The application forces a signed message assertion (`signMessage`) to ensure ownership of the Petra account, mitigating local UI spoofing.

## Known Limitations

- **Wallet-gating**: Wallet-gated policy validations are currently handled client-side upon decryption attempt. The decentralized blob itself is publicly accessible in encrypted byte form on Shelby if one has the ID.
- **Maximum File Constraints**: WebAssembly encryption instances running inside typical browser DOM setups may face memory crashes and instability when encrypting singular files surpassing ~100MB+ in dev modes.

## Deployment Notes

To deploy, build the dist artifacts:
```bash
npm run build
```
Vite will generate the `./dist` folder containing the compiled chunk strings, styling, and `.wasm` copies. This can be directly uploaded to Vercel, Netlify, or Github Pages as a standard static site. 
*(Ensure your routing configurations resolve fallback paths correctly if used outside of `index.html` root context).*
