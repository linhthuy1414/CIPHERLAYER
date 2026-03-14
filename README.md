# CipherLayer

Client-side AES-256-GCM encrypted file sharing app with Aptos testnet wallet integration and scaffolded Shelby testnet blob storage.

## Overview

CipherLayer encrypts files entirely in the browser using AES-256-GCM (via the Web Crypto API) before storing them. Files are shared via a unique file ID paired with a decryption key. The app integrates with the Aptos testnet for wallet connection and gas token (APT) balance checking via the Petra browser extension, and has scaffolded support for Shelby testnet blob storage (ShelbyUSD payment + SDK upload).

By default, upload and download use `localStorage` as the storage backend (mock mode). Real Shelby testnet uploads are coded but require an API key, funded wallet, and SDK availability — see [Shelby Integration Status](#shelby-integration-status).

## Current Status

### What works now

- **Vite dev server** — `npm install` → `npm run dev` starts the app at `localhost:5173`
- **AES-256-GCM encryption/decryption** — real client-side crypto via Web Crypto API (PBKDF2, 200k iterations)
- **SHA-256 integrity hashing** — computed before encryption, verified on download
- **Petra wallet connection** — real `window.aptos.connect()` / `signMessage()` / `disconnect()` when Petra extension is installed
- **APT balance check** — real REST API call to `https://fullnode.testnet.aptoslabs.com/v1`
- **Petra network verification** — checks that Petra is set to Testnet
- **Multi-file upload queue** — with per-file encrypt/upload progress bars
- **Upload/download via localStorage** — functional in mock mode (single browser only)
- **Vault dashboard** — persistent file history with status tracking (ACTIVE, EXPIRED, CONSUMED, REVOKED)
- **Vault search, filter, sort** — search by name/ID/link, filter by status, sort by date/name
- **Expiration policies** — never, 1 hour, 1 day, 7 days, one-download (auto-checked every 30s)
- **Access modes** — passphrase, public link, wallet-gated (address comparison is local)
- **Inbox** — shows wallet-gated files addressed to the connected wallet (local data only)
- **Passphrase tools** — generate, copy, toggle visibility, strength meter
- **Protocol event log** — comprehensive event logging stored in localStorage
- **Panic wipe** — one-click purge of all local data
- **Dev diagnostics panel** — shows provider mode, wallet state, balances, feature flags
- **Upload readiness panel** — pre-upload checklist (wallet, session, APT, ShelbyUSD, provider)
- **Aptos explorer links** — real links to `explorer.aptoslabs.com` for account/tx lookup

### What is scaffolded / in progress

- **Real Shelby upload** (`shelby-service.js` → `_realUpload`) — 3-step process is coded (file encoding → on-chain registration → RPC upload) but defaults to `USE_REAL_SHELBY: false` and has not been tested against a live Shelby testnet endpoint
- **Real Shelby download** (`shelby-service.js` → `_realDownload`) — HTTP GET to Shelby API is coded but untested; handles legacy mock IDs gracefully
- **Shelby SDK bridge** (`src/sdk-bridge.js`) — dynamically imports `@shelby-protocol/sdk/browser` and `@aptos-labs/ts-sdk`; catches failure and sets `ready = false`
- **Shelby explorer links** — URLs are constructed for `explorer.shelby.xyz` but in mock mode they point to non-existent blob resources

### What depends on credentials / funding

- Switching `USE_REAL_SHELBY: true` requires:
  - `VITE_SHELBY_API_KEY` set in `.env` (obtain from [geomi.dev](https://geomi.dev))
  - Wallet funded with testnet APT (from [Aptos faucet](https://faucet.testnet.aptoslabs.com/))
  - Wallet funded with ShelbyUSD (from [Shelby faucet](https://docs.shelby.xyz/apis/faucet/shelbyusd))
  - Shelby SDK package (`@shelby-protocol/sdk`) loading successfully in the browser

### What is still mock / fallback

- **ShelbyUSD balance** — always returns mock value (500 ShelbyUSD from localStorage). Even with `USE_REAL_SHELBY_BALANCE: true`, the code warns and falls back to mock (coin type address unconfirmed).
- **Blob upload/download** — uses localStorage by default. Cross-device sharing does not work in this mode.
- **Phantom and Backpack wallets** — UI buttons exist but only generate random addresses; no real SDK integration.
- **Mock APT balance** — used as fallback when Petra is not installed or API call fails (10 APT default).
- **Wallet-gated access enforcement** — address comparison is done locally in the browser, not verified on-chain.

## Features

- Multi-file upload with drag-and-drop and file queue management
- AES-256-GCM encryption with PBKDF2 key derivation (200,000 iterations)
- SHA-256 integrity hashing (pre-encryption compute, post-decryption verify)
- Auto-generate or manual passphrase with real-time strength meter
- Download by file ID or share link (auto-parses `?file=` query param)
- Expiration policies: never, 1 hour, 1 day, 7 days, one-download
- Access modes: passphrase, public link, wallet-gated
- Vault with persistent history, status tracking, search, filter, sort
- Link revocation and record deletion
- Protocol event log (up to 200 entries)
- Inbox for wallet-gated inbound files
- Emergency panic wipe
- Petra wallet connection with real Aptos testnet integration
- Upload readiness checklist and developer diagnostics panel
- Matrix rain canvas background (pink katakana)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Structure** | HTML5 (single `index.html`) |
| **Styling** | Vanilla CSS with CSS custom properties (~42KB) |
| **Logic** | Vanilla JavaScript (ES6+, no framework) |
| **Build** | Vite 6.x (dev server, bundler, env vars) |
| **Encryption** | Web Crypto API — AES-256-GCM |
| **Key Derivation** | PBKDF2 (200,000 iterations, SHA-256) |
| **Integrity** | SHA-256 via Web Crypto API |
| **Wallet (real)** | Petra — `window.aptos` API for connect, sign, disconnect, network check |
| **Wallet (mock)** | Random address generation for Phantom, Backpack |
| **Aptos balance** | Real REST API (`fullnode.testnet.aptoslabs.com`) with mock fallback |
| **Shelby SDK** | `@shelby-protocol/sdk` loaded via `src/sdk-bridge.js` (scaffolded, defaults to mock) |
| **Storage (default)** | `localStorage` (all encrypted data + vault records client-side) |
| **Dependencies** | `@shelby-protocol/sdk`, `@aptos-labs/ts-sdk`, `buffer` (npm) |

## Project Structure

```
index.html          — Single-page layout: header, wallet cluster, tabs (Upload/Download/Vault/Inbox), footer
style.css           — Dark cyberpunk theme, CSS custom properties, ~42KB
app.js              — Main application logic: tabs, crypto, wallet UI, upload/download flows,
                      vault rendering, inbox, balance UI, diagnostics, readiness panel (~1550 lines)
vault-utils.js      — BRAND constants, PassphraseUtil, ExpirationUtil, IntegrityUtil, AccessLog,
                      VaultHistory, VaultStats, VaultFilter, PanicWipe, ShareLinkUtil, FileQueue
wallet-utils.js     — WALLET_TYPES, WALLET_META, WalletAdapters (mock fallback),
                      WalletSession (session manager, real/mock modes), ACCESS_MODES
testnet-config.js   — TESTNET_CONFIG (Aptos + Shelby endpoints, feature flags, thresholds, faucet links),
                      TESTNET_ERRORS error codes
aptos-service.js    — AptosService: real Petra connect/sign/disconnect, APT balance via REST,
                      network verification, explorer link helpers, mock fallback
shelby-service.js   — ShelbyService: blob upload/download (mock + real paths), ShelbyUSD balance (mock),
                      cost estimation, affordability check, explorer URL helpers
matrix.js           — Matrix rain canvas background animation (pink katakana + alphanumeric)
src/sdk-bridge.js   — ES module that imports @shelby-protocol/sdk and @aptos-labs/ts-sdk,
                      exposes them as window._ShelbySDK, bridges Vite env vars to window._VITE_ENV
vite.config.js      — Vite configuration: root dir, port 5173, env prefix VITE_
package.json        — npm project: vite (dev), @shelby-protocol/sdk, @aptos-labs/ts-sdk, buffer
.env.example        — Template for VITE_SHELBY_API_KEY and VITE_APTOS_API_KEY
TESTING.md          — Comprehensive manual QA scenarios (~780 lines)
.gitignore          — Ignores node_modules/, dist/, .env, .env.local, *.log
```

## Setup

### Prerequisites

- Node.js (16+ recommended)
- npm
- **Petra wallet** browser extension — [install from petra.app](https://petra.app/)
- Switch Petra to **Testnet** in Petra settings → Network → Testnet

### Install and run

```bash
cd CipherLayer
npm install
npm run dev
```

This starts Vite at `http://localhost:5173` and opens the browser.

### Production build (optional)

```bash
npm run build
npm run preview
```

Output goes to `dist/`.

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```env
# Required for real Shelby uploads (not needed for default mock mode)
VITE_SHELBY_API_KEY=

# Optional — improves Aptos tx confirmation reliability
VITE_APTOS_API_KEY=
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SHELBY_API_KEY` | Only for real Shelby uploads | Client API key from [geomi.dev](https://geomi.dev) |
| `VITE_APTOS_API_KEY` | No | Improves Aptos transaction confirmation; from [developers.aptoslabs.com](https://developers.aptoslabs.com) |

Without a `.env` file, the app runs normally in mock mode.

The config also supports `window.CIPHERLAYER_ENV` overrides set before `testnet-config.js` loads.

## Usage

### Starting the app

```bash
npm run dev
```

Open `http://localhost:5173` in a browser with Petra installed.

### Wallet connection

1. Click **Connect Wallet** in the top-right
2. Select **Petra** (real connection) or Phantom/Backpack (mock)
3. If Petra is installed and set to Testnet, connection uses the real extension API
4. After connecting, click the wallet button → **Sign Session** to authorize

### Upload flow

1. Drag-and-drop or click to select files
2. Set expiration policy and access mode
3. Enter a passphrase or leave blank to auto-generate
4. Click **Encrypt & Create Secure Link**
5. The app encrypts client-side, then uploads to ShelbyService (localStorage by default)
6. Result card shows: file ID, share link, decryption key, SHA-256 hash, provider

### Download flow

1. Switch to Download tab
2. Paste a file ID (e.g. `cipher_...`) or full share link (`http://localhost:5173/?file=cipher_...`)
3. Enter the decryption key
4. Click **Decrypt & Download**
5. On success: integrity verification runs, file can be saved

### What to expect by default

By default (`USE_REAL_SHELBY: false`), upload/download uses localStorage. This means:

- Upload and download only work within the same browser on the same device
- Share links only work on the same browser where the file was uploaded
- ShelbyUSD balance is mock (500 ShelbyUSD from localStorage)
- The dev diagnostics panel shows `UPLOAD PROVIDER: mock-local`
- Explorer links for Shelby blobs point to the Shelby explorer but with mock IDs

## Feature Flags (`testnet-config.js`)

| Flag | Default | Description |
|------|---------|-------------|
| `USE_REAL_PETRA` | `true` | Use real Petra wallet if installed |
| `USE_REAL_APTOS_BALANCE` | `true` | Fetch APT balance via Aptos REST API |
| `USE_REAL_SHELBY` | `false` | Use real Shelby blob upload — requires SDK + API key + funded wallet |
| `USE_REAL_SHELBY_BALANCE` | `false` | Fetch real ShelbyUSD balance — not yet implemented, falls back to mock |
| `REQUIRE_WALLET_FOR_UPLOAD` | `true` | Block upload if no wallet connected |
| `REQUIRE_BALANCE_CHECK` | `true` | Block upload if balance insufficient |
| `REQUIRE_SESSION_SIGN` | `true` | Block upload if session not signed |
| `REQUIRE_NETWORK_CHECK` | `true` | Block upload if Petra is not on Testnet |
| `SHOW_DEV_PANEL` | `true` | Show dev diagnostics in Vault tab |
| `SHOW_TESTNET_BADGE` | `true` | Show testnet mode indicator |

## Shelby Integration Status

### What is currently real

- **Shelby SDK declaration** — `@shelby-protocol/sdk` is listed in `package.json` as a dependency
- **SDK bridge** — `src/sdk-bridge.js` dynamically imports the SDK and Aptos TS SDK, polyfills `Buffer`, and exposes the SDK on `window._ShelbySDK`
- **Upload code path** — `shelby-service.js` → `_realUpload()` implements the 3-step Shelby flow: file encoding (erasure coding), on-chain blob registration (Aptos tx via Petra), RPC upload
- **Download code path** — `shelby-service.js` → `_realDownload()` does an HTTP GET to `{SHELBY_API_URL}/shelby/v1/blobs/{address}/{blobName}`
- **Explorer URLs** — Constructed for `https://explorer.shelby.xyz/testnet/...`
- **Error handling** — Graceful fallback if SDK fails to load; clear error messages for missing API key

### What requires API key

- `VITE_SHELBY_API_KEY` must be set in `.env` — obtained from [geomi.dev](https://geomi.dev) (create account → API Resource → Testnet → Generate, use CLIENT key)
- Without this key, `_getApiKey()` throws and real uploads fail

### What requires funded wallet / ShelbyUSD / testnet setup

- Real upload requires testnet APT for gas (on-chain blob registration is an Aptos transaction)
- Real upload requires ShelbyUSD for storage fees
- APT faucet: https://faucet.testnet.aptoslabs.com/
- ShelbyUSD faucet: https://docs.shelby.xyz/apis/faucet/shelbyusd

### What still falls back to mock

- **ShelbyUSD balance** — `getBalance()` always returns mock even when `USE_REAL_SHELBY_BALANCE: true` (code has a warning: "real balance not yet implemented")
- **Default upload/download** — `USE_REAL_SHELBY` is `false` by default, so all upload/download goes through localStorage
- **Mock ShelbyUSD accounting** — upload cost is deducted from the mock balance in localStorage

### Explorer links

Explorer links for Shelby blobs are generated using the blob ID and blob name. In mock mode, blob IDs are randomly generated SHA-256 hashes, so the resulting URLs point to non-existent resources on `explorer.shelby.xyz`. In real mode (if the upload succeeded), these links should resolve to the actual blob on the Shelby explorer.

Aptos explorer links (`explorer.aptoslabs.com`) work correctly for real Petra wallet addresses.

## Known Limitations

| Limitation | Detail |
|-----------|--------|
| **Default mode is localStorage-only** | Upload/download uses localStorage by default. Share links only work in the same browser. |
| **localStorage size cap** | Browsers limit localStorage to ~5–10 MB per origin. Large files will fail. |
| **No file streaming** | Entire file must fit in browser memory for encryption/decryption. |
| **ShelbyUSD balance is always mock** | Real balance query not implemented; coin type address unconfirmed in SDK docs. |
| **Real Shelby upload is untested** | Code path exists but has not been verified against a live Shelby testnet. |
| **Phantom / Backpack are mock-only** | UI shows these wallets but only generates random addresses. |
| **Wallet-gated is local-only** | Recipient address matching is done client-side in JavaScript, not on-chain. |
| **Mock wallets generate new addresses** | Each mock connect generates a random address. Cannot reconnect to the same address. |
| **Cross-device sharing requires real Shelby** | Without real Shelby, shared files are only accessible in the same browser. |
| **Clipboard requires localhost or HTTPS** | `navigator.clipboard.writeText()` may fail on `file://` URLs. |
| **No automated tests** | Project has detailed manual QA scenarios in `TESTING.md` but no unit/integration test suite. |

## Next Steps

1. **Verify Shelby SDK loading** — confirm `@shelby-protocol/sdk/browser` imports work and WASM initializes in the browser
2. **Test real Shelby upload end-to-end** — set `USE_REAL_SHELBY: true`, provide API key, fund wallet, attempt a real upload
3. **Implement real ShelbyUSD balance** — determine the correct coin type address and query the Aptos on-chain token store
4. **Add real Phantom/Backpack adapters** — replace mock `WalletAdapters.connect()` with actual wallet SDK calls
5. **Add automated tests** — convert `TESTING.md` scenarios into a test suite (e.g. Playwright, Vitest)
6. **Add wallet-gated verification** — move address matching to an on-chain check or signed proof
7. **Handle large files** — add file streaming or chunked encryption to avoid memory limits
8. **Add a license file** — the repository currently has no `LICENSE` file

## License

License not specified in this repository. No `LICENSE` file exists.

---

By [github.com/linhthuy1414](https://github.com/linhthuy1414)
