// ═══════════════════════════════════════════════════════════════════════════════
// aptos-service.js — Aptos Testnet Integration for CipherLayer
// Real Petra wallet connection via window.aptos API
// Real APT balance checking via Aptos REST API
// Fallback to mock when Petra is not installed
// ═══════════════════════════════════════════════════════════════════════════════

const AptosService = (() => {
  const _log = (msg, ...args) => console.log(`[AptosService] ${msg}`, ...args);
  const _warn = (msg, ...args) => console.warn(`[AptosService] ${msg}`, ...args);
  const _err = (msg, ...args) => console.error(`[AptosService] ${msg}`, ...args);

  // ─── Petra Wallet Detection ─────────────────────────────────────────────────
  function isPetraInstalled() {
    const hasWindow = typeof window !== 'undefined';
    const hasAptos = hasWindow && 'aptos' in window;
    const hasPetra = hasWindow && 'petra' in window;
    _log('isPetraInstalled check:', {
      hasWindow,
      hasWindowAptos: hasAptos,
      hasWindowPetra: hasPetra,
      aptosType: hasAptos ? typeof window.aptos : 'N/A',
    });
    // Petra can inject as window.aptos OR window.petra
    return hasAptos || hasPetra;
  }

  // Get the actual provider object (Petra may be at window.aptos or window.petra)
  function _getProvider() {
    if (typeof window === 'undefined') return null;
    // Prefer window.aptos (standard Petra location)
    if (window.aptos) return window.aptos;
    // Fallback: window.petra (some versions use this)
    if (window.petra) return window.petra;
    return null;
  }

  function shouldUseRealPetra() {
    const useReal = TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_PETRA;
    const installed = isPetraInstalled();
    _log('shouldUseRealPetra:', { featureFlag: useReal, installed, result: useReal && installed });
    return useReal && installed;
  }

  // ─── Real Petra Connect ─────────────────────────────────────────────────────
  // Uses window.aptos.connect() — the Petra wallet extension API
  async function connectPetra() {
    _log('connectPetra called');

    const provider = _getProvider();
    if (!provider) {
      _err('No Petra provider found. window.aptos =', typeof window.aptos, ', window.petra =', typeof window.petra);
      throw new Error(
        'PETRA_NOT_INSTALLED: Petra wallet extension not detected. ' +
        'Please install Petra from https://petra.app and refresh the page.'
      );
    }

    _log('Petra provider found, calling connect()...');
    try {
      const response = await provider.connect();
      _log('Petra connect() response:', {
        address: response.address ? response.address.slice(0, 10) + '...' : 'MISSING',
        publicKey: response.publicKey ? 'present' : 'absent',
      });

      if (!response || !response.address) {
        throw new Error('Petra returned empty response — no address received.');
      }

      return {
        address: response.address,
        publicKey: response.publicKey || null,
        isReal: true
      };
    } catch (err) {
      _err('Petra connect() failed:', err);
      // Provide clear, user-friendly error messages
      const msg = err.message || 'Unknown error';
      if (msg.includes('User rejected') || msg.includes('rejected') || msg.includes('denied')) {
        throw new Error('CONNECTION_REJECTED: You declined the Petra connection request. Please try again and approve the connection.');
      }
      if (msg.includes('PETRA_NOT_INSTALLED')) {
        throw err; // re-throw our own error
      }
      throw new Error('PETRA_CONNECT_FAILED: ' + msg);
    }
  }

  // ─── Real Petra Disconnect ──────────────────────────────────────────────────
  async function disconnectPetra() {
    const provider = _getProvider();
    if (provider) {
      try {
        await provider.disconnect();
        _log('Petra disconnected');
      } catch (e) {
        _warn('Petra disconnect error (ignored):', e.message);
      }
    }
  }

  // ─── Real Petra Sign Message ────────────────────────────────────────────────
  // Uses window.aptos.signMessage() for session authentication
  async function signMessagePetra(message) {
    const provider = _getProvider();
    if (!provider) {
      _err('signMessagePetra: No provider found');
      throw new Error(
        'PETRA_NOT_INSTALLED: Petra wallet extension not detected. ' +
        'Please install Petra from https://petra.app and refresh the page.'
      );
    }

    _log('signMessagePetra: requesting signature...');
    try {
      const nonce = Date.now().toString();
      const response = await provider.signMessage({
        message: message,
        nonce: nonce
      });
      _log('signMessagePetra: signature received');
      return {
        signature: response.signature,
        fullMessage: response.fullMessage || message,
        isReal: true
      };
    } catch (err) {
      _warn('signMessagePetra: user rejected or error:', err.message);
      throw new Error('User rejected the signature request');
    }
  }

  // ─── Get Aptos Account (Real) ───────────────────────────────────────────────
  async function getAccount() {
    const provider = _getProvider();
    if (!provider) {
      _log('getAccount: no provider');
      return null;
    }
    try {
      const account = await provider.account();
      _log('getAccount: got account', account?.address ? account.address.slice(0, 10) + '...' : 'null');
      return account;
    } catch (e) {
      _warn('getAccount failed:', e.message);
      return null;
    }
  }

  // ─── APT Balance via Aptos REST API ─────────────────────────────────────────
  // This is a REAL API call to the Aptos testnet fullnode
  async function getAptBalance(address) {
    if (!TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_APTOS_BALANCE) {
      _log('getAptBalance: using mock (feature flag off)');
      return getMockAptBalance();
    }

    try {
      const url = `${TESTNET_CONFIG.APTOS.NODE_URL}/accounts/${address}/resources`;
      _log('getAptBalance: fetching', url.slice(0, 60) + '...');
      const response = await fetch(url);

      if (!response.ok) {
        _warn('Balance API error:', response.status);
        return getMockAptBalance();
      }

      const resources = await response.json();
      const coinStore = resources.find(r =>
        r.type === TESTNET_CONFIG.APTOS.NATIVE_TOKEN.coinStoreType
      );

      if (!coinStore) {
        _log('getAptBalance: account exists but no APT coin store');
        return 0;
      }

      const rawBalance = parseInt(coinStore.data.coin.value, 10);
      const balance = rawBalance / Math.pow(10, TESTNET_CONFIG.APTOS.NATIVE_TOKEN.decimals);
      _log('getAptBalance:', balance.toFixed(4), 'APT');
      return balance;
    } catch (err) {
      _warn('Balance fetch failed:', err.message);
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
    const provider = _getProvider();
    if (!provider) {
      _log('checkNetwork: no provider');
      return null;
    }
    try {
      const network = await provider.network();
      _log('checkNetwork: Petra reports network =', network);
      return network; // "Testnet", "Mainnet", "Devnet"
    } catch (e) {
      _warn('checkNetwork failed:', e.message);
      return null;
    }
  }

  // ─── Verify Network Matches Testnet ─────────────────────────────────────────
  // Returns: { ok, network, expected, code? }
  async function verifyTestnetNetwork() {
    const network = await checkNetwork();
    if (network === null) {
      // Petra not installed or can't detect → skip check
      _log('verifyTestnetNetwork: skipping (no provider or network unknown)');
      return { ok: true, network: 'unknown', expected: TESTNET_CONFIG.APTOS.EXPECTED_NETWORK };
    }
    const expected = TESTNET_CONFIG.APTOS.EXPECTED_NETWORK;
    if (network.toLowerCase() !== expected.toLowerCase()) {
      _warn('Network mismatch:', network, '≠', expected);
      return {
        ok: false,
        network,
        expected,
        code: TESTNET_ERRORS.NETWORK_MISMATCH
      };
    }
    _log('verifyTestnetNetwork: OK (', network, ')');
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
