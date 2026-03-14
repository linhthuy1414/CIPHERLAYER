// ═══════════════════════════════════════════════════════════════════════════════
// aptos-service.js — Aptos Testnet Integration for CipherLayer
// Real wallet connection via window.aptos (Aptos Wallet Standard)
// Real APT balance checking via Aptos REST API
// Fallback to mock when no compatible wallet is installed
//
// NOTE: window.petra is DEPRECATED and removed. Only window.aptos is used.
// ═══════════════════════════════════════════════════════════════════════════════

const AptosService = (() => {
  const _log = (msg, ...args) => console.log(`[AptosService] ${msg}`, ...args);
  const _warn = (msg, ...args) => console.warn(`[AptosService] ${msg}`, ...args);
  const _err = (msg, ...args) => console.error(`[AptosService] ${msg}`, ...args);

  // ─── Wallet Detection (Aptos Wallet Standard only) ──────────────────────────
  // Modern Petra (and other Aptos wallets) inject window.aptos.
  // window.petra is DEPRECATED — do NOT use it.
  function isPetraInstalled() {
    const hasWindow = typeof window !== 'undefined';
    const hasAptos = hasWindow && typeof window.aptos === 'object' && window.aptos !== null;
    _log('isPetraInstalled:', { hasWindow, hasWindowAptos: hasAptos });
    return hasAptos;
  }

  // Return the Aptos wallet provider — ONLY window.aptos
  function _getProvider() {
    if (typeof window === 'undefined') return null;
    if (typeof window.aptos === 'object' && window.aptos !== null) return window.aptos;
    return null;
  }

  function shouldUseRealPetra() {
    const useReal = TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_PETRA;
    const installed = isPetraInstalled();
    const result = useReal && installed;
    _log('shouldUseRealPetra:', { featureFlag: useReal, installed, result });
    return result;
  }

  // ─── Real Wallet Connect ────────────────────────────────────────────────────
  // Uses window.aptos.connect() — the Aptos Wallet Standard
  async function connectPetra() {
    _log('connectPetra: starting...');

    const provider = _getProvider();
    if (!provider) {
      _err('connectPetra: window.aptos is not available.', {
        windowType: typeof window,
        aptosType: typeof window !== 'undefined' ? typeof window.aptos : 'N/A',
      });
      throw new Error(
        'PETRA_NOT_INSTALLED: No Aptos wallet detected (window.aptos is missing). ' +
        'Install Petra from https://petra.app and refresh this page.'
      );
    }

    _log('connectPetra: provider found, calling window.aptos.connect()...');
    try {
      const response = await provider.connect();
      _log('connectPetra: connect() returned:', {
        address: response?.address ? response.address.slice(0, 12) + '...' : 'MISSING',
        publicKey: response?.publicKey ? 'present' : 'absent',
        keys: response ? Object.keys(response) : [],
      });

      if (!response || !response.address) {
        throw new Error('Wallet returned empty response — no address received.');
      }

      return {
        address: response.address,
        publicKey: response.publicKey || null,
        isReal: true
      };
    } catch (err) {
      _err('connectPetra: connect() failed:', err.message || err);
      const msg = err.message || String(err);

      if (msg.includes('User rejected') || msg.includes('rejected') || msg.includes('denied')) {
        throw new Error('CONNECTION_REJECTED: You declined the wallet connection request. Try again and approve.');
      }
      if (msg.includes('PETRA_NOT_INSTALLED')) {
        throw err;
      }
      if (msg.includes('deprecated') || msg.includes('no longer supported')) {
        throw new Error(
          'WALLET_API_DEPRECATED: The wallet provider returned a deprecation error. ' +
          'Please update your Petra extension to the latest version.'
        );
      }
      throw new Error('WALLET_CONNECT_FAILED: ' + msg);
    }
  }

  // ─── Disconnect ─────────────────────────────────────────────────────────────
  async function disconnectPetra() {
    const provider = _getProvider();
    if (provider) {
      try {
        await provider.disconnect();
        _log('disconnectPetra: done');
      } catch (e) {
        _warn('disconnectPetra error (ignored):', e.message);
      }
    }
  }

  // ─── Sign Message ───────────────────────────────────────────────────────────
  // Uses window.aptos.signMessage() for session authentication
  async function signMessagePetra(message) {
    const provider = _getProvider();
    if (!provider) {
      _err('signMessagePetra: window.aptos not available');
      throw new Error(
        'WALLET_NOT_AVAILABLE: No Aptos wallet detected. ' +
        'Install Petra from https://petra.app and refresh.'
      );
    }

    _log('signMessagePetra: requesting signature via window.aptos.signMessage()...');
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
      _warn('signMessagePetra: rejected or error:', err.message);
      throw new Error('SIGN_REJECTED: User rejected the signature request.');
    }
  }

  // ─── Get Account ────────────────────────────────────────────────────────────
  async function getAccount() {
    const provider = _getProvider();
    if (!provider) {
      _log('getAccount: no provider');
      return null;
    }
    try {
      const account = await provider.account();
      _log('getAccount:', account?.address ? account.address.slice(0, 12) + '...' : 'null');
      return account;
    } catch (e) {
      _warn('getAccount failed:', e.message);
      return null;
    }
  }

  // ─── Validate Aptos Address Format ──────────────────────────────────────────
  // A valid Aptos address is 0x followed by 1-64 hex chars
  function _isValidAptosAddress(address) {
    if (!address || typeof address !== 'string') return false;
    return /^0x[0-9a-fA-F]{1,64}$/.test(address);
  }

  // ─── APT Balance via Aptos REST API ─────────────────────────────────────────
  // REAL API call to the Aptos testnet fullnode.
  // Only called with a valid address; mock addresses skip the real call.
  async function getAptBalance(address) {
    if (!TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_APTOS_BALANCE) {
      _log('getAptBalance: mock mode (flag off)');
      return getMockAptBalance();
    }

    // Guard: don't hit the real API with a random mock address
    if (!_isValidAptosAddress(address)) {
      _warn('getAptBalance: address looks invalid, using mock. address =', address?.slice?.(0, 20));
      return getMockAptBalance();
    }

    const url = `${TESTNET_CONFIG.APTOS.NODE_URL}/accounts/${address}/resources`;
    _log('getAptBalance: fetching', url.slice(0, 70) + '...');

    try {
      const response = await fetch(url);

      if (response.status === 404) {
        // Account not found on testnet — might be new or unfunded
        _log('getAptBalance: account not found (404) — returning 0');
        return 0;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        _warn('getAptBalance: API error', response.status, body.slice(0, 200));
        return getMockAptBalance();
      }

      const resources = await response.json();
      const coinStore = resources.find(r =>
        r.type === TESTNET_CONFIG.APTOS.NATIVE_TOKEN.coinStoreType
      );

      if (!coinStore) {
        _log('getAptBalance: account exists but no APT coin store — returning 0');
        return 0;
      }

      const rawBalance = parseInt(coinStore.data.coin.value, 10);
      const balance = rawBalance / Math.pow(10, TESTNET_CONFIG.APTOS.NATIVE_TOKEN.decimals);
      _log('getAptBalance:', balance.toFixed(4), 'APT');
      return balance;
    } catch (err) {
      _warn('getAptBalance: fetch error:', err.message);
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
    return 10.0;
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

  // ─── Explorer Links ─────────────────────────────────────────────────────────
  function getExplorerAccountLink(address) {
    return `${TESTNET_CONFIG.APTOS.EXPLORER_URL}/account/${address}?network=testnet`;
  }

  function getExplorerTxLink(txHash) {
    return `${TESTNET_CONFIG.APTOS.EXPLORER_URL}/txn/${txHash}?network=testnet`;
  }

  // ─── Check Network ─────────────────────────────────────────────────────────
  async function checkNetwork() {
    const provider = _getProvider();
    if (!provider) {
      _log('checkNetwork: no provider');
      return null;
    }
    try {
      const network = await provider.network();
      _log('checkNetwork: wallet reports network =', network);
      return network; // "Testnet", "Mainnet", "Devnet"
    } catch (e) {
      _warn('checkNetwork error:', e.message);
      return null;
    }
  }

  // ─── Verify Network Matches Testnet ─────────────────────────────────────────
  async function verifyTestnetNetwork() {
    const network = await checkNetwork();
    if (network === null) {
      _log('verifyTestnetNetwork: skipped (no provider or network unknown)');
      return { ok: true, network: 'unknown', expected: TESTNET_CONFIG.APTOS.EXPECTED_NETWORK };
    }
    const expected = TESTNET_CONFIG.APTOS.EXPECTED_NETWORK;
    // Handle Petra returning either a string ("Testnet") or an object
    const networkName = typeof network === 'string' ? network : (network.name || network.networkName || String(network));
    if (networkName.toLowerCase() !== expected.toLowerCase()) {
      _warn('verifyTestnetNetwork: MISMATCH', networkName, '≠', expected);
      return { ok: false, network: networkName, expected, code: TESTNET_ERRORS.NETWORK_MISMATCH };
    }
    _log('verifyTestnetNetwork: OK (', networkName, ')');
    return { ok: true, network: networkName, expected };
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
