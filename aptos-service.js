// ═══════════════════════════════════════════════════════════════════════════════
// aptos-service.js — Aptos Testnet Integration for CipherLayer
// Real Petra wallet connection via window.aptos API
// Real APT balance checking via Aptos REST API
// Fallback to mock when Petra is not installed
// ═══════════════════════════════════════════════════════════════════════════════

const AptosService = (() => {
  // ─── Petra Wallet Detection ─────────────────────────────────────────────────
  function isPetraInstalled() {
    return typeof window !== 'undefined' && 'aptos' in window;
  }

  function shouldUseRealPetra() {
    return TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_PETRA && isPetraInstalled();
  }

  // ─── Real Petra Connect ─────────────────────────────────────────────────────
  // Uses window.aptos.connect() — the Petra wallet extension API
  async function connectPetra() {
    if (!isPetraInstalled()) {
      throw new Error(TESTNET_ERRORS.PETRA_NOT_INSTALLED);
    }

    try {
      const response = await window.aptos.connect();
      return {
        address: response.address,
        publicKey: response.publicKey || null,
        isReal: true
      };
    } catch (err) {
      // User rejected connection or Petra error
      throw new Error('Petra connection rejected: ' + (err.message || 'Unknown error'));
    }
  }

  // ─── Real Petra Disconnect ──────────────────────────────────────────────────
  async function disconnectPetra() {
    if (isPetraInstalled()) {
      try {
        await window.aptos.disconnect();
      } catch { /* ignore disconnect errors */ }
    }
  }

  // ─── Real Petra Sign Message ────────────────────────────────────────────────
  // Uses window.aptos.signMessage() for session authentication
  async function signMessagePetra(message) {
    if (!isPetraInstalled()) {
      throw new Error(TESTNET_ERRORS.PETRA_NOT_INSTALLED);
    }

    try {
      const nonce = Date.now().toString();
      const response = await window.aptos.signMessage({
        message: message,
        nonce: nonce
      });
      return {
        signature: response.signature,
        fullMessage: response.fullMessage || message,
        isReal: true
      };
    } catch (err) {
      throw new Error('User rejected the signature request');
    }
  }

  // ─── Get Aptos Account (Real) ───────────────────────────────────────────────
  async function getAccount() {
    if (!isPetraInstalled()) return null;
    try {
      return await window.aptos.account();
    } catch {
      return null;
    }
  }

  // ─── APT Balance via Aptos REST API ─────────────────────────────────────────
  // This is a REAL API call to the Aptos testnet fullnode
  async function getAptBalance(address) {
    if (!TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_APTOS_BALANCE) {
      return getMockAptBalance();
    }

    try {
      const url = `${TESTNET_CONFIG.APTOS.NODE_URL}/accounts/${address}/resources`;
      const response = await fetch(url);

      if (!response.ok) {
        console.warn('[AptosService] Balance API error:', response.status);
        return getMockAptBalance();
      }

      const resources = await response.json();
      const coinStore = resources.find(r =>
        r.type === TESTNET_CONFIG.APTOS.NATIVE_TOKEN.coinStoreType
      );

      if (!coinStore) {
        // Account exists but has no APT (possible on testnet)
        return 0;
      }

      const rawBalance = parseInt(coinStore.data.coin.value, 10);
      return rawBalance / Math.pow(10, TESTNET_CONFIG.APTOS.NATIVE_TOKEN.decimals);
    } catch (err) {
      console.warn('[AptosService] Balance fetch failed:', err.message);
      return getMockAptBalance();
    }
  }

  // ─── Mock APT Balance (fallback) ────────────────────────────────────────────
  const MOCK_APT_KEY = 'cipherlayer_mock_apt_balance';

  function getMockAptBalance() {
    try {
      const stored = localStorage.getItem(MOCK_APT_KEY);
      if (stored !== null) return parseFloat(stored);
    } catch { }
    return 10.0; // Default mock: 10 APT
  }

  function setMockAptBalance(amount) {
    localStorage.setItem(MOCK_APT_KEY, amount.toString());
  }

  // ─── Check APT Sufficiency ──────────────────────────────────────────────────
  function checkAptSufficiency(balance) {
    if (balance <= 0) return { ok: false, code: TESTNET_ERRORS.MISSING_APT_TESTNET, label: 'MISSING' };
    if (balance < TESTNET_CONFIG.THRESHOLDS.MIN_APT_FOR_GAS) return { ok: false, code: TESTNET_ERRORS.MISSING_APT_TESTNET, label: 'INSUFFICIENT' };
    if (balance < TESTNET_CONFIG.THRESHOLDS.LOW_APT_WARNING) return { ok: true, code: TESTNET_ERRORS.LOW_APT_BALANCE, label: 'LOW' };
    return { ok: true, code: null, label: 'READY' };
  }

  // ─── Get Explorer Link ──────────────────────────────────────────────────────
  function getExplorerAccountLink(address) {
    return `${TESTNET_CONFIG.APTOS.EXPLORER_URL}/account/${address}?network=testnet`;
  }

  function getExplorerTxLink(txHash) {
    return `${TESTNET_CONFIG.APTOS.EXPLORER_URL}/txn/${txHash}?network=testnet`;
  }

  // ─── Check Network (Petra) ──────────────────────────────────────────────────
  async function checkNetwork() {
    if (!isPetraInstalled()) return null;
    try {
      const network = await window.aptos.network();
      return network; // "Testnet", "Mainnet", "Devnet"
    } catch {
      return null;
    }
  }

  // ─── Verify Network Matches Testnet ─────────────────────────────────────────
  // Returns: { ok, network, expected, code? }
  async function verifyTestnetNetwork() {
    const network = await checkNetwork();
    if (network === null) {
      // Petra not installed or can't detect → skip check
      return { ok: true, network: 'unknown', expected: TESTNET_CONFIG.APTOS.EXPECTED_NETWORK };
    }
    const expected = TESTNET_CONFIG.APTOS.EXPECTED_NETWORK;
    if (network.toLowerCase() !== expected.toLowerCase()) {
      return {
        ok: false,
        network,
        expected,
        code: TESTNET_ERRORS.NETWORK_MISMATCH
      };
    }
    return { ok: true, network, expected };
  }

  return {
    isPetraInstalled,
    shouldUseRealPetra,
    connectPetra,
    disconnectPetra,
    signMessagePetra,
    getAccount,
    getAptBalance,
    getMockAptBalance,
    setMockAptBalance,
    checkAptSufficiency,
    getExplorerAccountLink,
    getExplorerTxLink,
    checkNetwork,
    verifyTestnetNetwork
  };
})();
