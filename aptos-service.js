// ═══════════════════════════════════════════════════════════════════════════════
// aptos-service.js — Aptos Testnet Integration for CipherLayer
//
// APPROACH: Official Aptos Wallet Adapter (@aptos-labs/wallet-adapter-core)
//
// The wallet adapter is initialized in sdk-bridge.js (ES module) and exposed
// as window._AptosWalletAdapter. This file wraps it in a clean API for use
// by app.js and shelby-service.js.
//
// WHY this approach:
//   - Official, Aptos-recommended way to implement AIP-62 Wallet Standard
//   - Handles wallet discovery timing, reconnection, account/network change events
//   - No direct window.aptos or window.petra — those are fully deprecated
//   - Maintained by the Aptos Labs team
//
// BALANCE: APT balance is fetched via the Aptos REST API (no wallet involved).
// ═══════════════════════════════════════════════════════════════════════════════

const AptosService = (() => {
  const _log = (msg, ...args) => console.log(`[AptosService] ${msg}`, ...args);
  const _warn = (msg, ...args) => console.warn(`[AptosService] ${msg}`, ...args);
  const _err = (msg, ...args) => console.error(`[AptosService] ${msg}`, ...args);

  // ─── Adapter Access ─────────────────────────────────────────────────────────
  // The adapter is created in sdk-bridge.js (which runs as a <script type="module">).
  // Module scripts are deferred, so the adapter MAY not be ready when this file
  // first loads. All public functions access it at CALL-TIME, not load-time.
  function _getAdapter() {
    return window._AptosWalletAdapter || null;
  }

  // Chờ SDK bridge load xong (vì esm.sh bundle khá nặng có thể mất 1-3s)
  async function awaitSDK() {
    if (window._ShelbySDK && window._ShelbySDK.ready) return window._ShelbySDK;
    return new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (window._ShelbySDK && window._ShelbySDK.ready) {
                clearInterval(interval);
                resolve(window._ShelbySDK);
            } else if (attempts >= 50) { // 5s timeout
                clearInterval(interval);
                resolve(null);
            }
        }, 100);
    });
  }

  // ─── Wallet Detection ──────────────────────────────────────────────────────
  function isPetraInstalled() {
    const adapter = _getAdapter();
    if (!adapter) {
      // _log('isPetraInstalled: adapter not ready yet');
      return false;
    }
    const wallets = adapter.wallets || [];
    const petra = wallets.find(w => w.name === 'Petra');
    // _log('isPetraInstalled:', {
    //   adapterReady: true,
    //   totalWallets: wallets.length,
    //   walletNames: wallets.map(w => w.name),
    //   petraFound: !!petra,
    // });
    return !!petra;
  }

  function shouldUseRealPetra() {
    const useReal = TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_PETRA;
    const installed = isPetraInstalled();
    const result = useReal && installed;
    // _log('shouldUseRealPetra:', { featureFlag: useReal, installed, result });
    return result;
  }

  // ─── Connect via Wallet Adapter ────────────────────────────────────────────
  async function connectPetra() {
    _log('connectPetra: starting via official Wallet Adapter...');

    const adapter = _getAdapter();
    if (!adapter) {
      _err('connectPetra: Wallet Adapter not initialized (window._AptosWalletAdapter is null)');
      throw new Error(
        'ADAPTER_NOT_READY: Aptos Wallet Adapter not loaded. ' +
        'The page may still be initializing — try refreshing.'
      );
    }

    // Check if Petra is among discovered wallets
    const wallets = adapter.wallets || [];
    const petra = wallets.find(w => w.name === 'Petra');
    if (!petra) {
      _err('connectPetra: Petra not found among discovered wallets:', wallets.map(w => w.name));
      throw new Error(
        'PETRA_NOT_INSTALLED: Petra wallet not detected. ' +
        'Install Petra from https://petra.app and refresh this page.'
      );
    }

    _log('connectPetra: Petra found, calling adapter.connect("Petra")...');
    try {
      await adapter.connect('Petra');

      const account = adapter.account;
      _log('connectPetra: connected! account:', {
        address: account?.address ? String(account.address).slice(0, 14) + '...' : 'MISSING',
        publicKey: account?.publicKey ? 'present' : 'absent',
      });

      if (!account || !account.address) {
        throw new Error('WALLET_EMPTY_RESPONSE: Wallet connected but returned no account info.');
      }

      // Normalize address to string (Aptos SDK may return AccountAddress object)
      const address = typeof account.address === 'string'
        ? account.address
        : String(account.address);

      return {
        address,
        publicKey: account.publicKey || null,
        isReal: true
      };

    } catch (err) {
      _err('connectPetra: connect failed:', err.message || err);
      const msg = err.message || String(err);

      // Don't wrap our own errors
      if (msg.includes('PETRA_NOT_INSTALLED') || msg.includes('ADAPTER_NOT_READY') || msg.includes('WALLET_EMPTY_RESPONSE')) {
        throw err;
      }
      if (msg.includes('User rejected') || msg.includes('rejected') || msg.includes('denied')) {
        throw new Error('CONNECTION_REJECTED: You declined the wallet connection request. Try again and approve.');
      }
      throw new Error('WALLET_CONNECT_FAILED: ' + msg);
    }
  }

  // ─── Disconnect ────────────────────────────────────────────────────────────
  async function disconnectPetra() {
    const adapter = _getAdapter();
    if (!adapter) return;
    try {
      await adapter.disconnect();
      _log('disconnectPetra: done');
    } catch (e) {
      _warn('disconnectPetra error (ignored):', e.message);
    }
  }

  // ─── Sign Message ──────────────────────────────────────────────────────────
  async function signMessagePetra(message) {
    let adapter = _getAdapter();
    console.log('[AptosService] signMessagePetra called. adapter:', !!adapter, 'account:', adapter?.account);
    
    // Auto-reconnect if adapter exists but account is null (happens after page reload)
    if (adapter && !adapter.account) {
      _log('signMessagePetra: adapter.account is null, attempting auto-reconnect...');
      try {
        await adapter.connect('Petra');
        _log('signMessagePetra: auto-reconnect done, account:', adapter.account);
      } catch (reconErr) {
        _warn('signMessagePetra: auto-reconnect failed:', reconErr.message);
      }
    }

    if (!adapter || !adapter.account) {
      console.error('[AptosService] Cannot sign: adapter is missing or account not found after reconnect attempt.');
      throw new Error('WALLET_NOT_CONNECTED: Connect your wallet before signing.');
    }

    _log('signMessagePetra: requesting signature...');
    try {
      const nonce = Date.now().toString();
      const response = await adapter.signMessage({ message, nonce });
      _log('signMessagePetra: signature received');
      return {
        signature: response.signature || response.fullMessage || 'signed',
        fullMessage: response.fullMessage || message,
        isReal: true
      };
    } catch (err) {
      _warn('signMessagePetra error:', err.message);
      const msg = err.message || String(err);
      if (msg.includes('rejected') || msg.includes('denied')) {
        throw new Error('SIGN_REJECTED: You declined the signature request.');
      }
      throw new Error('SIGN_FAILED: ' + msg);
    }
  }

  // ─── Sign and Submit Transaction ───────────────────────────────────────────
  // Used by shelby-service.js for on-chain blob registration.
  async function signAndSubmitTransaction(payload) {
    const adapter = _getAdapter();
    if (!adapter || !adapter.account) {
      throw new Error('WALLET_NOT_CONNECTED: Connect your wallet before submitting transactions.');
    }

    _log('signAndSubmitTransaction: submitting via Wallet Adapter...');

    // ─── Đảm bảo toàn bộ numeric arguments biến thành string ─────────────────
    if (payload.functionArguments) {
        payload.functionArguments = payload.functionArguments.map(arg => {
            if (typeof arg === 'number' || typeof arg === 'bigint') return String(arg);
            return arg;
        });
    }
    if (payload.arguments) {
        payload.arguments = payload.arguments.map(arg => {
            if (typeof arg === 'number' || typeof arg === 'bigint') return String(arg);
            return arg;
        });
    }
    console.log('[AptosService] Final Payload to Adapter:', payload);

    try {
      const response = await adapter.signAndSubmitTransaction({ data: payload });
      _log('signAndSubmitTransaction: success, hash =', response?.hash ? response.hash.slice(0, 16) + '...' : 'unknown');
      return response;
    } catch (err) {
      _err('signAndSubmitTransaction failed:', err.message);
      const msg = err.message || String(err);
      if (msg.includes('rejected') || msg.includes('denied')) {
        throw new Error('TRANSACTION_REJECTED: You declined the transaction.');
      }
      throw new Error('TRANSACTION_FAILED: ' + msg);
    }
  }

  // ─── Get Account ───────────────────────────────────────────────────────────
  async function getAccount() {
    const adapter = _getAdapter();
    if (!adapter) {
      _log('getAccount: adapter not ready');
      return null;
    }
    const account = adapter.account;
    if (!account) {
      _log('getAccount: no connected account');
      return null;
    }
    const address = typeof account.address === 'string' ? account.address : String(account.address);
    _log('getAccount:', address.slice(0, 14) + '...');
    return { address, publicKey: account.publicKey || null };
  }

  // ─── Validate Aptos Address Format ─────────────────────────────────────────
  function _isValidAptosAddress(address) {
    if (!address || typeof address !== 'string') return false;
    return /^0x[0-9a-fA-F]{1,64}$/.test(address);
  }

  // ─── APT Balance via view function ──────────────────────────────────────────
  // PRIMARY: POST /v1/view with 0x1::coin::balance<AptosCoin>
  // This works during Aptos' CoinStore→FungibleAsset migration phase where
  // GET /resources returns [] but the view function returns the real balance.
  // Proven by audit: address 0x66188c...cd547 returns 2097317200 (20.97 APT).
  async function getAptBalance(address) {
    if (!TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_APTOS_BALANCE) {
      _log('getAptBalance: mock mode (flag off)');
      return getMockAptBalance();
    }

    if (!_isValidAptosAddress(address)) {
      _warn('getAptBalance: invalid address format, using mock. addr =', address?.slice?.(0, 20));
      return getMockAptBalance();
    }

    _log('getAptBalance: checking', address.slice(0, 14) + '...');

    // ── Method 1: View function (proven to work on testnet) ─────────────────
    try {
      const viewUrl = `${TESTNET_CONFIG.APTOS.NODE_URL}/view`;
      _log('getAptBalance: trying view function POST', viewUrl);
      const viewRes = await fetch(viewUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          function: '0x1::coin::balance',
          type_arguments: ['0x1::aptos_coin::AptosCoin'],
          arguments: [address]
        })
      });

      if (viewRes.ok) {
        const viewData = await viewRes.json();
        if (Array.isArray(viewData) && viewData.length > 0) {
          const raw = parseInt(viewData[0], 10);
          const balance = raw / Math.pow(10, TESTNET_CONFIG.APTOS.NATIVE_TOKEN.decimals);
          _log('getAptBalance (view fn):', balance.toFixed(4), 'APT (raw:', viewData[0], ')');
          return balance;
        }
      } else {
        const errText = await viewRes.text().catch(() => '');
        _warn('getAptBalance: view function returned', viewRes.status, errText.slice(0, 200));
      }
    } catch (viewErr) {
      _warn('getAptBalance: view function error:', viewErr.message);
    }

    // ── Method 2: Aptos TS SDK (fallback) ───────────────────────────────────
    try {
      const sdk = await awaitSDK();
      if (sdk && sdk.ready && sdk.Aptos) {
        const aptosClient = new sdk.Aptos(new sdk.AptosConfig({ network: sdk.Network.TESTNET }));
        const rawBalance = await aptosClient.getAccountCoinAmount({ accountAddress: address, coinType: '0x1::aptos_coin::AptosCoin' });
        const balance = parseInt(rawBalance, 10) / Math.pow(10, TESTNET_CONFIG.APTOS.NATIVE_TOKEN.decimals);
        _log('getAptBalance (SDK fallback):', balance.toFixed(4), 'APT');
        return balance;
      }
    } catch (sdkErr) {
      _warn('getAptBalance: SDK fallback error:', sdkErr.message);
    }

    // ── Method 3: Legacy CoinStore resource (last resort) ───────────────────
    try {
      const url = `${TESTNET_CONFIG.APTOS.NODE_URL}/accounts/${address}/resources`;
      const response = await fetch(url);
      if (response.ok) {
        const resources = await response.json();
        const coinStore = resources.find(r =>
          r.type === TESTNET_CONFIG.APTOS.NATIVE_TOKEN.coinStoreType
        );
        if (coinStore) {
          const raw = parseInt(coinStore.data.coin.value, 10);
          const balance = raw / Math.pow(10, TESTNET_CONFIG.APTOS.NATIVE_TOKEN.decimals);
          _log('getAptBalance (CoinStore):', balance.toFixed(4), 'APT');
          return balance;
        }
      }
    } catch (restErr) {
      _warn('getAptBalance: REST fallback error:', restErr.message);
    }

    _warn('getAptBalance: all methods failed, returning 0');
    return 0;
  }

  // ─── Mock APT Balance ──────────────────────────────────────────────────────
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

  // ─── Check APT Sufficiency ─────────────────────────────────────────────────
  function checkAptSufficiency(balance) {
    if (balance <= 0) return { ok: false, code: TESTNET_ERRORS.MISSING_APT_TESTNET, label: 'MISSING' };
    if (balance < TESTNET_CONFIG.THRESHOLDS.MIN_APT_FOR_GAS) return { ok: false, code: TESTNET_ERRORS.MISSING_APT_TESTNET, label: 'INSUFFICIENT' };
    if (balance < TESTNET_CONFIG.THRESHOLDS.LOW_APT_WARNING) return { ok: true, code: TESTNET_ERRORS.LOW_APT_BALANCE, label: 'LOW' };
    return { ok: true, code: null, label: 'READY' };
  }

  // ─── Explorer Links ────────────────────────────────────────────────────────
  function getExplorerAccountLink(address) {
    return `${TESTNET_CONFIG.APTOS.EXPLORER_URL}/account/${address}?network=testnet`;
  }

  function getExplorerTxLink(txHash) {
    return `${TESTNET_CONFIG.APTOS.EXPLORER_URL}/txn/${txHash}?network=testnet`;
  }

  // ─── Check Network ─────────────────────────────────────────────────────────
  async function checkNetwork() {
    const adapter = _getAdapter();
    if (!adapter || !adapter.account) {
      _log('checkNetwork: not connected');
      return null;
    }
    const netInfo = adapter.network;
    if (!netInfo) {
      _log('checkNetwork: no network info available');
      return null;
    }
    // Wallet Adapter returns NetworkInfo { name, chainId, url }
    const name = netInfo.name || (typeof netInfo === 'string' ? netInfo : null);
    _log('checkNetwork:', name, netInfo.chainId ? '(chainId: ' + netInfo.chainId + ')' : '');
    return name;
  }

  // ─── Verify Network Matches Testnet ────────────────────────────────────────
  async function verifyTestnetNetwork() {
    const network = await checkNetwork();
    if (network === null) {
      _log('verifyTestnetNetwork: skipped (not connected or no network info)');
      return { ok: true, network: 'unknown', expected: TESTNET_CONFIG.APTOS.EXPECTED_NETWORK };
    }
    const expected = TESTNET_CONFIG.APTOS.EXPECTED_NETWORK;
    // Compare case-insensitively: adapter may return "testnet" or "Testnet"
    if (network.toLowerCase() !== expected.toLowerCase()) {
      _warn('verifyTestnetNetwork: MISMATCH', network, '≠', expected);
      return { ok: false, network, expected, code: TESTNET_ERRORS.NETWORK_MISMATCH };
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
    signAndSubmitTransaction,
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
