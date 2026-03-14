# CipherLayer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Secure Encrypted File Relay** — Client-side AES-256-GCM encrypted file sharing with zero-knowledge privacy, terminal/cyber UI, Aptos testnet wallet integration, and Shelby testnet blob storage architecture.

CipherLayer encrypts files **entirely in the browser** before storing them. The app integrates with **Aptos testnet** for wallet connection/gas (APT) and **Shelby testnet** for blob upload fees (ShelbyUSD). Files are shared via a unique File ID + decryption key pair. Optional wallet-gated sharing restricts access to a specific wallet address.

---

## Features

### Core Encryption & Upload
- **Multi-file upload** — select or drag & drop multiple files at once
- **Per-file encrypt/upload progress** — separate progress bars for encryption and upload phases
- **File queue management** — view queued files, remove individual items, clear all
- **Passphrase tools** — generate random word-based passphrase ([GEN]), copy to clipboard ([CPY]), toggle visibility ([👁])
- **Passphrase strength indicator** — real-time WEAK / MEDIUM / STRONG meter with color bar
- **Auto-generate key** — if no passphrase entered, a 32-char random key is generated automatically
- **SHA-256 integrity hash** — computed from original file before encryption, stored with record

### Download & Decryption
- **Download by File ID** — paste the `cipher_*` file ID directly
- **Download by share link** — paste the full `?file=` URL; auto-parsed to file ID
- **Auto-detect share link** — if opened with `?file=` query param, auto-switches to Download tab
- **Integrity verification** — SHA-256 hash of decrypted file compared against stored hash on download
- **Save decrypted file** — browser download of the decrypted original file

### Vault Records
- **Vault dashboard** — persistent file history stored in localStorage
- **Status tracking** — each record has status: `ACTIVE`, `EXPIRED`, `CONSUMED`, `REVOKED`
- **Vault statistics** — grid showing TOTAL / ACTIVE / EXPIRED / CONSUMED / REVOKED / DOWNLOADS counts
- **Search** — filter records by file name, file ID, or share link
- **Filter buttons** — ALL / ACTIVE / EXPIRED / CONSUMED / REVOKED
- **Sort** — NEWEST / OLDEST / NAME

### Expiration & Self-Destruct
- **NEVER** / **1 HOUR** / **1 DAY** / **7 DAYS** / **ONE DOWNLOAD**
- **Auto-expiration** — background check every 30 seconds marks expired records

### Access Modes
- **PASSPHRASE** (default) — standard passphrase-encrypted sharing
- **PUBLIC LINK** — stored as access mode but still requires the encryption key
- **WALLET-GATED** — recipient wallet address required; download only allowed if connected wallet matches

### Protocol Events
- Comprehensive event log with **all testnet events logged**:
  - `TESTNET_MODE_ENABLED`, `WALLET_CONNECTED`, `WALLET_DISCONNECTED`
  - `SIGNATURE_REQUESTED`, `SIGNATURE_ACCEPTED`, `SIGNATURE_REJECTED`
  - `APT_BALANCE_CHECKED`, `SHELBY_BALANCE_CHECKED`
  - `MISSING_APT_TESTNET`, `MISSING_SHELBY_USD`
  - `SHELBY_UPLOAD_STARTED`, `SHELBY_UPLOAD_COMPLETED`, `SHELBY_UPLOAD_FAILED`
  - `RECORD_PERSISTED`, `FILE_ENCRYPTED`, `FILE_UPLOADED`, `LINK_CREATED`

### Panic Wipe
- **One-click purge** — removes ALL vault records, encrypted data, access logs, wallet session, mock balances

### Inbox / Inbound Relay
- Wallet-gated files addressed to your connected wallet appear in the INBOX tab

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Structure** | HTML5 (single `index.html`) |
| **Styling** | Vanilla CSS with CSS custom properties |
| **Logic** | Vanilla JavaScript (ES6+, no framework) |
| **Encryption** | Web Crypto API — AES-256-GCM |
| **Key Derivation** | PBKDF2 (200,000 iterations, SHA-256) |
| **Integrity** | SHA-256 hash via Web Crypto API |
| **Persistence** | localStorage (all data client-side) |
| **Wallet** | Real Petra via `window.aptos` + mock fallback |
| **Dependencies** | **Zero** — no npm, no build step, no external libraries |

---

## Architecture

```
index.html         — Single-page layout: wallet cluster, testnet indicator, tabs, panels
style.css          — Full dark terminal theme: ~1740 lines, CSS custom properties
app.js             — Main app logic: tabs, crypto, wallet UI, inbox, vault, testnet panels
vault-utils.js     — BRAND, PassphraseUtil, ExpirationUtil, IntegrityUtil, AccessLog,
                     VaultHistory, VaultStats, VaultFilter, PanicWipe, ShareLinkUtil, FileQueue
wallet-utils.js    — WALLET_TYPES, WALLET_META, WalletAdapters (mock fallback),
                     WalletSession (session + real/mock modes), ACCESS_MODES
testnet-config.js  — TESTNET_CONFIG (Aptos+Shelby endpoints, feature flags, thresholds)
aptos-service.js   — AptosService (real Petra connect/sign/disconnect, APT balance via REST,
                     network verification)
shelby-service.js  — ShelbyService (blob upload/download abstraction, mock ShelbyUSD balance,
                     cost estimation, affordability check)
matrix.js          — Matrix rain canvas background animation (pink katakana)
```

### Testnet Architecture

| Layer | Network | Token | Status |
|-------|---------|-------|--------|
| **Wallet/Gas** | Aptos Testnet | APT | ✅ Real Petra API (`window.aptos`) + real balance via REST |
| **Blob Storage** | Shelby Testnet | ShelbyUSD | ⚠ Mock (real SDK not yet available) |
| **Encryption** | Client-side | — | ✅ Real AES-256-GCM via Web Crypto API |
| **Persistence** | localStorage | — | ✅ Real (per-browser) |

---

## Testnet Dev Setup

### Prerequisites
- A modern browser (Chrome, Firefox, Edge recommended)
- **Petra wallet** browser extension — [install from petra.app](https://petra.app/)
- Switch Petra to **Testnet** in Petra settings → Network → Testnet

### APT Testnet — What & Why
- **APT** is the native gas token on Aptos testnet
- Required for signing transactions on Aptos (gas fees)
- Get free testnet APT from: **https://faucet.testnet.aptoslabs.com/**
- The app checks your APT balance via the real Aptos REST API
- If balance is below `0.01 APT`, upload is blocked with `MISSING_APT_TESTNET`

### ShelbyUSD Testnet — What & Why
- **ShelbyUSD** is the token used to pay for blob uploads on Shelby testnet
- Currently **mock** (auto-set to 500 ShelbyUSD in localStorage)
- When the real Shelby SDK/API becomes available, set `USE_REAL_SHELBY = true` in `testnet-config.js`
- Upload cost is estimated at `0.1 ShelbyUSD per MB` (configurable)
- If balance is too low, upload is blocked with `MISSING_SHELBY_USD`

### Run Locally

**Option 1 — Python:**
```bash
cd CipherLayer
python -m http.server 8080
# Open http://localhost:8080
```

**Option 2 — Node:**
```bash
npx -y http-server . -p 8080
```

**Option 3 — VS Code:** Right-click `index.html` → "Open with Live Server"

No build step, no `npm install`, no bundler.

### Env Overrides

You can override config without editing `testnet-config.js` by setting `window.CIPHERLAYER_ENV` before the scripts load:

```html
<script>
  window.CIPHERLAYER_ENV = {
    MODE: 'testnet',
    TESTNET_MODE: true,
    APTOS_NODE_URL: 'https://your-custom-node/v1',
    SHELBY_API_URL: 'https://your-shelby-endpoint'
  };
</script>
<script src="testnet-config.js"></script>
```

---

## Feature Flags (`testnet-config.js`)

| Flag | Default | Description |
|------|---------|-------------|
| `USE_REAL_PETRA` | `true` | Use real Petra wallet if installed |
| `USE_REAL_APTOS_BALANCE` | `true` | Fetch APT balance via Aptos REST API |
| `USE_REAL_SHELBY` | `false` | Use real Shelby blob upload (⚠ not yet available) |
| `USE_REAL_SHELBY_BALANCE` | `false` | Fetch real ShelbyUSD balance (⚠ not yet available) |
| `REQUIRE_WALLET_FOR_UPLOAD` | `true` | Block upload if no wallet connected |
| `REQUIRE_BALANCE_CHECK` | `true` | Block upload if balance insufficient |
| `REQUIRE_SESSION_SIGN` | `true` | Block upload if session not signed |
| `REQUIRE_NETWORK_CHECK` | `true` | Block upload if Petra is not on Testnet |
| `SHOW_DEV_PANEL` | `true` | Show dev diagnostics in Vault tab |
| `SHOW_TESTNET_BADGE` | `true` | Show testnet mode indicator |

---

## What's Real vs Mock

| Component | Real | Mock |
|-----------|------|------|
| Petra wallet connect | ✅ `window.aptos.connect()` | Fallback random address |
| Petra disconnect | ✅ `window.aptos.disconnect()` | N/A |
| Petra sign message | ✅ `window.aptos.signMessage()` | 85% success random sig |
| Petra network check | ✅ `window.aptos.network()` | Skipped |
| APT balance | ✅ Aptos REST API | 10 APT default |
| ShelbyUSD balance | ❌ | 500 ShelbyUSD default |
| Blob upload | ❌ | localStorage |
| Blob download | ❌ | localStorage |

---

## Upload Flow (Testnet)

### Successful Upload
1. Connect Petra (testnet) → wallet session CONNECTED
2. Sign session → status AUTHORIZED
3. App checks: APT balance ✓, ShelbyUSD balance ✓, network = Testnet ✓
4. Select files → ENCRYPT_AND_UPLOAD
5. File encrypted client-side (AES-256-GCM)
6. Upload blob via `ShelbyService.uploadBlob()` (mock or real)
7. ShelbyUSD cost deducted
8. Vault record persisted in localStorage
9. Protocol events logged: `SHELBY_UPLOAD_STARTED` → `SHELBY_UPLOAD_COMPLETED` → `RECORD_PERSISTED`
10. UI shows file ID, share link, decrypt key, SHA-256 hash

### Error Scenarios
| Error Code | Trigger |
|------------|---------|
| `WALLET_NOT_CONNECTED` | No wallet connected, upload attempted |
| `SESSION_NOT_AUTHORIZED` | Wallet connected but session not signed |
| `MISSING_APT_TESTNET` | APT balance < 0.01 |
| `MISSING_SHELBY_USD` | ShelbyUSD balance < 0.1 |
| `UPLOAD_COST_EXCEEDS_BALANCE` | Upload cost > ShelbyUSD balance |
| `NETWORK_MISMATCH` | Petra is on Mainnet/Devnet instead of Testnet |
| `SHELBY_UPLOAD_FAILED` | Upload blob call failed |

### Fallback Mock Mode
When `USE_REAL_SHELBY = false` (default):
- Upload uses localStorage instead of Shelby API
- ShelbyUSD balance is mock (localStorage)
- Protocol events clearly indicate `[mock-local]` provider
- Dev diagnostics panel shows `UPLOAD PROVIDER: mock-local`

---

## Dev Diagnostics Panel

Visible in the **Vault** tab (when `SHOW_DEV_PANEL = true`), shows:

| Field | Description |
|-------|-------------|
| NETWORK | Current mode (TESTNET) |
| UPLOAD PROVIDER | `mock-local` or `shelby-testnet` |
| PETRA DETECTED | Whether `window.aptos` exists |
| WALLET STATUS | DISCONNECTED / CONNECTED / AUTHORIZED |
| WALLET MODE | REAL or MOCK |
| APT BALANCE | With [REAL] or [MOCK] tag |
| SHELBYUSD | With [REAL] or [MOCK] tag |
| BALANCE CHECK | Last check timestamp |
| LAST UPLOAD | Status and timestamp of last upload |
| REQUIRE WALLET | YES/NO |
| REQUIRE SIGN | YES/NO |
| REQUIRE BAL. | YES/NO |

---

## Upload Readiness Panel

Shown in Upload tab, displays at-a-glance status:
- ✓/✗/⚠ WALLET — connected or not
- ✓/✗/⚠ SESSION — signed or not
- ✓/✗ APT — balance and status
- ✓/✗ ShelbyUSD — balance and status
- ✓/⚠ UPLOAD — provider mode

---

## Data Model / Local Persistence

All data is stored in `localStorage`. Aptos balance is fetched via REST API (real).

### localStorage Keys
| Key | Content |
|-----|---------|
| `cipherlayer_vault_history` | JSON array of vault records |
| `cipherlayer_access_log` | JSON array of access log entries |
| `cipherlayer_wallet_session` | JSON wallet session object |
| `cipherlayer_mock_apt_balance` | Mock APT balance (when using mock) |
| `cipherlayer_mock_shelby_balance` | Mock ShelbyUSD balance |
| `cipher_*` | Base64-encoded encrypted file payloads |

---

## Replacing Mock with Real Shelby Testnet

When the Shelby testnet SDK becomes available:

1. **Set feature flags** in `testnet-config.js`:
   ```js
   USE_REAL_SHELBY: true,
   USE_REAL_SHELBY_BALANCE: true,
   ```

2. **Update `shelby-service.js`** — replace the TODO sections in:
   - `getBalance()` — call real balance API
   - `uploadBlob()` — call real upload SDK
   - `downloadBlob()` — call real download SDK

3. **Update `TESTNET_CONFIG.SHELBY`** — set real `API_URL` and `EXPLORER_URL`

4. Everything else (UI, events, error handling, balance checks) is already wired up.

---

## Current Limitations

| Limitation | Detail |
|-----------|--------|
| **No real Shelby SDK** | Upload/download uses localStorage; ShelbyUSD is mock |
| **No cross-device sharing** | Since mock upload is localStorage, shared links only work same browser |
| **localStorage limits** | ~5-10MB total per origin |
| **No file streaming** | Entire file must fit in memory |
| **No on-chain verification** | Wallet-gated checks compare addresses locally |

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

Built with 🔐 — **CipherLayer**: Client-side encrypted sharing protocol.

By [github.com/linhthuy1414](https://github.com/linhthuy1414)
