// ═══════════════════════════════════════════════════════════════════════════════
// testnet-config.js — CipherLayer Testnet Configuration
// Networks: Aptos Testnet (wallet/gas) + Shelby Testnet (blob storage)
//
// ENV OVERRIDE: Set variables before loading this script to override defaults.
// Example: <script>window.CIPHERLAYER_ENV = { TESTNET_MODE: false };</script>
// ═══════════════════════════════════════════════════════════════════════════════

const _env = (typeof window !== 'undefined' && window.CIPHERLAYER_ENV) || {};
const _viteEnv = (typeof window !== 'undefined' && window._VITE_ENV) || {};

const TESTNET_CONFIG = Object.freeze({
  MODE: _env.MODE || 'testnet',
  IS_TESTNET: _env.TESTNET_MODE !== undefined ? !!_env.TESTNET_MODE : true,
  VERSION: 'v2.2-testnet',

  // ─── Aptos Testnet ──────────────────────────────────────────────────────────
  APTOS: {
    NETWORK_NAME: 'Aptos Testnet',
    NODE_URL: _env.APTOS_NODE_URL || 'https://fullnode.testnet.aptoslabs.com/v1',
    FAUCET_URL: 'https://faucet.testnet.aptoslabs.com',
    EXPLORER_URL: 'https://explorer.aptoslabs.com',
    CHAIN_ID: 2,
    EXPECTED_NETWORK: 'Testnet',   // Petra returns "Testnet", "Mainnet", or "Devnet"
    NATIVE_TOKEN: {
      symbol: 'APT',
      decimals: 8,
      type: '0x1::aptos_coin::AptosCoin',
      coinStoreType: '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
    }
  },

  // ─── Shelby Testnet ─────────────────────────────────────────────────────────
  // Real SDK: @shelby-protocol/sdk — docs at https://docs.shelby.xyz
  // API keys from: https://geomi.dev
  SHELBY: {
    NETWORK_NAME: 'Shelby Testnet',
    API_URL: _env.SHELBY_API_URL || 'https://api.testnet.shelby.xyz',        // real Shelby testnet RPC
    // Priority: 1. localStorage, 2. vite env, 3. node env
    API_KEY: localStorage.getItem('cipherlayer_shelby_api_key') || _viteEnv.SHELBY_API_KEY || _env.SHELBY_API_KEY || '',
    APTOS_API_KEY: _viteEnv.APTOS_API_KEY || _env.APTOS_API_KEY || '',        // optional, for tx confirmation
    // Real Shelby Explorer — URL patterns:
    //   Blob:    /testnet/blobs/{accountAddress}?blobName={fileName}
    //   Account: /testnet/account/{accountAddress}/blobs
    //   Events:  /testnet/events
    EXPLORER_URL: 'https://explorer.shelby.xyz',
    TOKEN: {
      symbol: 'ShelbyUSD',
      decimals: 8,    // confirmed on-chain: Metadata.data.decimals = 8
      // Fungible Asset metadata object address (not a Coin module)
      // Discovered via txn 0x2881ff...dc74 payload args + on-chain Metadata query
      faMetadataAddress: '0x1b18363a9f1fe5e6ebf247daba5cc1c18052bb232efdc4c50f556053922d98e1'
    },
    UPLOAD_COST_PER_MB: 0.1  // estimated cost per MB in ShelbyUSD
  },

  // ─── Balance Thresholds ─────────────────────────────────────────────────────
  THRESHOLDS: {
    MIN_APT_FOR_GAS: 0.01,        // minimum APT needed for a transaction
    MIN_SHELBY_USD: 0.1,          // minimum ShelbyUSD needed for upload
    LOW_APT_WARNING: 0.1,         // show warning below this APT
    LOW_SHELBY_WARNING: 1.0       // show warning below this ShelbyUSD
  },

  // ─── Feature Flags ──────────────────────────────────────────────────────────
  // Toggle real vs mock for each subsystem independently
  FEATURE_FLAGS: {
    USE_REAL_PETRA: true,              // use Aptos Wallet Adapter (AIP-62) for Petra
    USE_REAL_APTOS_BALANCE: true,      // fetch APT balance via REST API
    USE_REAL_SHELBY: true,            // ⚠ false = mock upload (no real Shelby SDK yet)
    USE_REAL_SHELBY_BALANCE: true,    // ⚠ false = mock ShelbyUSD balance
    REQUIRE_WALLET_FOR_UPLOAD: true,   // enforce wallet connection before upload
    REQUIRE_BALANCE_CHECK: true,       // enforce balance check before upload
    REQUIRE_SESSION_SIGN: true,        // enforce signed session before upload
    REQUIRE_NETWORK_CHECK: true,       // enforce Aptos testnet network match
    SHOW_DEV_PANEL: true,              // show dev diagnostics panel
    SHOW_TESTNET_BADGE: true           // show testnet mode indicator
  },

  // ─── Faucet Links ───────────────────────────────────────────────────────────
  FAUCETS: {
    APT: 'https://faucet.testnet.aptoslabs.com/',
    SHELBY: 'https://docs.shelby.xyz/apis/faucet/shelbyusd'  // real Shelby faucet
  }
});

// ─── Testnet Error Codes ──────────────────────────────────────────────────────
const TESTNET_ERRORS = Object.freeze({
  MISSING_APT_TESTNET: 'MISSING_APT_TESTNET',
  MISSING_SHELBY_USD: 'MISSING_SHELBY_USD',
  LOW_APT_BALANCE: 'LOW_APT_BALANCE',
  LOW_SHELBY_BALANCE: 'LOW_SHELBY_BALANCE',
  WALLET_NOT_CONNECTED: 'WALLET_NOT_CONNECTED',
  SESSION_NOT_AUTHORIZED: 'SESSION_NOT_AUTHORIZED',
  SHELBY_UPLOAD_FAILED: 'SHELBY_UPLOAD_FAILED',
  APTOS_GAS_FAILURE: 'APTOS_GAS_FAILURE',
  NETWORK_MISMATCH: 'NETWORK_MISMATCH',
  PETRA_NOT_INSTALLED: 'PETRA_NOT_INSTALLED',
  APTOS_API_ERROR: 'APTOS_API_ERROR',
  BALANCE_CHECK_FAILED: 'BALANCE_CHECK_FAILED',
  UPLOAD_COST_EXCEEDS_BALANCE: 'UPLOAD_COST_EXCEEDS_BALANCE'
});
