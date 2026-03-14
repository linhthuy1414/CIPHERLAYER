// ═══════════════════════════════════════════════════════════════════════════════
// wallet-utils.js — CipherLayer Web3 Wallet Integration
// Mock adapters, session management, wallet types
// Ready for real SDK replacement (Petra, Phantom, Backpack)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Wallet Types & Constants ────────────────────────────────────────────────
const WALLET_TYPES = Object.freeze({
  PETRA: 'petra',
  PHANTOM: 'phantom',
  BACKPACK: 'backpack'
});

const WALLET_META = Object.freeze({
  [WALLET_TYPES.PETRA]: {
    name: 'Petra',
    chain: 'Aptos',
    icon: '🔷',
    addressPrefix: '0x',
    addressLength: 64
  },
  [WALLET_TYPES.PHANTOM]: {
    name: 'Phantom',
    chain: 'Solana',
    icon: '👻',
    addressPrefix: '',
    addressLength: 44
  },
  [WALLET_TYPES.BACKPACK]: {
    name: 'Backpack',
    chain: 'Multi',
    icon: '🎒',
    addressPrefix: '',
    addressLength: 44
  }
});

const WALLET_SESSION_STATUS = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTED: 'CONNECTED',
  SIGNED: 'SIGNED',
  AUTHORIZED: 'AUTHORIZED'
});

const WALLET_STORAGE_KEY = 'cipherlayer_wallet_session';

// ─── Wallet Action Types (for AccessLog) ─────────────────────────────────────
const WALLET_ACTIONS = Object.freeze({
  WALLET_CONNECTED: 'WALLET_CONNECTED',
  WALLET_DISCONNECTED: 'WALLET_DISCONNECTED',
  SIGNATURE_REQUESTED: 'SIGNATURE_REQUESTED',
  SIGNATURE_ACCEPTED: 'SIGNATURE_ACCEPTED',
  SIGNATURE_REJECTED: 'SIGNATURE_REJECTED',
  WALLET_ADDRESS_COPIED: 'WALLET_ADDRESS_COPIED',
  WALLET_GATED_DENIED: 'WALLET_GATED_DENIED',
  WALLET_GATED_ALLOWED: 'WALLET_GATED_ALLOWED'
});

// ─── Mock Wallet Adapters ────────────────────────────────────────────────────
// These generate realistic-looking addresses. Replace with real SDK calls later.
const WalletAdapters = (() => {
  function generateMockAddress(walletType) {
    const meta = WALLET_META[walletType];
    const bytes = crypto.getRandomValues(new Uint8Array(meta.addressLength / 2));
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

    if (walletType === WALLET_TYPES.PETRA) {
      return '0x' + hex.slice(0, 64);
    }
    // Solana-style base58-like (mock with alphanumeric)
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let addr = '';
    for (let i = 0; i < 44; i++) {
      addr += chars[bytes[i % bytes.length] % chars.length];
    }
    return addr;
  }

  function shortenAddress(address) {
    if (!address) return '';
    if (address.length <= 12) return address;
    return address.slice(0, 6) + '...' + address.slice(-4);
  }

  // Mock connect — replace with real SDK
  async function connect(walletType) {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    const address = generateMockAddress(walletType);
    return { address, walletType };
  }

  // Mock sign message — replace with real SDK
  async function signMessage(walletType, message) {
    await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
    // 85% chance of success in mock mode
    if (Math.random() < 0.15) {
      throw new Error('User rejected the signature request');
    }
    const sigBytes = crypto.getRandomValues(new Uint8Array(64));
    return Array.from(sigBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return { connect, signMessage, shortenAddress, generateMockAddress };
})();

// ─── Wallet Session Manager ─────────────────────────────────────────────────
const WalletSession = (() => {
  let session = null;
  let listeners = [];

  function onUpdate(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(fn => fn(getSession())); }

  function getSession() {
    if (session) return { ...session };
    try {
      const stored = localStorage.getItem(WALLET_STORAGE_KEY);
      if (stored) {
        session = JSON.parse(stored);
        return { ...session };
      }
    } catch { }
    return null;
  }

  function save(s) {
    session = s;
    if (s) {
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(s));
    } else {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    }
    notify();
  }

  async function connect(walletType) {
    const result = await WalletAdapters.connect(walletType);
    const newSession = {
      walletType,
      address: result.address,
      status: WALLET_SESSION_STATUS.CONNECTED,
      connectedAt: Date.now(),
      signedAt: null,
      signature: null
    };
    save(newSession);
    return newSession;
  }

  async function signSession() {
    const s = getSession();
    if (!s || s.status === WALLET_SESSION_STATUS.DISCONNECTED) {
      throw new Error('No wallet connected');
    }

    const message = `CipherLayer Session Auth\nTimestamp: ${Date.now()}\nWallet: ${s.address}`;
    const signature = await WalletAdapters.signMessage(s.walletType, message);

    const updated = {
      ...s,
      status: WALLET_SESSION_STATUS.AUTHORIZED,
      signedAt: Date.now(),
      signature: signature.slice(0, 32) + '...'
    };
    save(updated);
    return updated;
  }

  function disconnect() {
    save(null);
    session = null;
  }

  function isConnected() {
    const s = getSession();
    return s && s.status !== WALLET_SESSION_STATUS.DISCONNECTED;
  }

  function isSigned() {
    const s = getSession();
    return s && (s.status === WALLET_SESSION_STATUS.SIGNED || s.status === WALLET_SESSION_STATUS.AUTHORIZED);
  }

  function getAddress() {
    const s = getSession();
    return s ? s.address : null;
  }

  function clearStorage() {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    session = null;
  }

  // ─── Real wallet connection (used with AptosService) ────────────────────────
  function connectReal(walletType, address) {
    const newSession = {
      walletType,
      address,
      status: WALLET_SESSION_STATUS.CONNECTED,
      connectedAt: Date.now(),
      signedAt: null,
      signature: null,
      isReal: true
    };
    save(newSession);
    return newSession;
  }

  function signSessionReal(signature) {
    const s = getSession();
    if (!s) throw new Error('No wallet connected');
    const updated = {
      ...s,
      status: WALLET_SESSION_STATUS.AUTHORIZED,
      signedAt: Date.now(),
      signature: typeof signature === 'string' ? signature.slice(0, 32) + '...' : 'signed',
      isReal: true
    };
    save(updated);
    return updated;
  }

  function isRealSession() {
    const s = getSession();
    return s && s.isReal === true;
  }

  return { getSession, connect, signSession, disconnect, isConnected, isSigned, getAddress, onUpdate, clearStorage, connectReal, signSessionReal, isRealSession };
})();

// ─── Access Mode Constants ───────────────────────────────────────────────────
const ACCESS_MODES = Object.freeze({
  PUBLIC: 'public',
  PASSPHRASE: 'passphrase',
  WALLET_GATED: 'wallet-gated'
});
