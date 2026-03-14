// ═══════════════════════════════════════════════════════════════════════════════
// shelby-service.js — Shelby Testnet Blob Storage for CipherLayer
//
// MODES:
//   USE_REAL_SHELBY: true  → Real Shelby testnet (requires SDK + API key + ShelbyUSD)
//   USE_REAL_SHELBY: false → Mock mode (localStorage, no real network calls)
//
// ARCHITECTURE:
//   The Shelby SDK (@shelby-protocol/sdk) is loaded by src/sdk-bridge.js
//   and exposed as window._ShelbySDK. This file checks for its availability
//   at call-time (not load-time), so the deferred module execution is safe.
//
// REAL UPLOAD (3 steps, per Shelby docs):
//   1. File Encoding  — erasure coding + commitment hashes (WASM, from SDK)
//   2. On-Chain Reg   — Aptos transaction via Petra (registers blob metadata)
//   3. RPC Upload     — POST to Shelby storage providers (validated against chain)
//
// REAL DOWNLOAD (simple HTTP, no SDK needed):
//   GET https://api.testnet.shelby.xyz/shelby/v1/blobs/{address}/{blobName}
//
// DEPENDENCIES:
//   npm install @shelby-protocol/sdk @aptos-labs/ts-sdk
//   API key from geomi.dev
//   ShelbyUSD from docs.shelby.xyz/apis/faucet/shelbyusd
// ═══════════════════════════════════════════════════════════════════════════════

const ShelbyService = (() => {
  const MOCK_BALANCE_KEY = 'cipherlayer_mock_shelby_balance';

  // ─── Base64 Helpers (self-contained for this service) ───────────────────────
  function _toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function _fromBase64(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  // ─── SDK Availability Check ─────────────────────────────────────────────────
  function _isSDKReady() {
    return typeof window !== 'undefined'
      && window._ShelbySDK
      && window._ShelbySDK.ready === true;
  }

  function _getSDK() {
    if (!_isSDKReady()) {
      throw new Error(
        'Shelby SDK not loaded. Ensure you are running via "npm run dev" (Vite) ' +
        'and that @shelby-protocol/sdk is installed.'
      );
    }
    return window._ShelbySDK;
  }

  function _getApiKey() {
    const key = TESTNET_CONFIG.SHELBY.API_KEY;
    if (!key) {
      throw new Error(
        'Missing Shelby API key. Create a .env file with VITE_SHELBY_API_KEY=your_key. ' +
        'Get a key from https://geomi.dev'
      );
    }
    return key;
  }

  // ─── ShelbyUSD Balance ──────────────────────────────────────────────────────
  async function getBalance(address) {
    if (TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY_BALANCE) {
      // Real ShelbyUSD balance requires querying the Aptos on-chain token store
      // for the ShelbyUSD coin type. The exact coin type address is not yet
      // confirmed in the SDK docs. Falling back to mock.
      console.warn('[ShelbyService] USE_REAL_SHELBY_BALANCE: real balance not yet implemented. Using mock.');
      return getMockBalance();
    }
    return getMockBalance();
  }

  function getMockBalance() {
    try {
      const stored = localStorage.getItem(MOCK_BALANCE_KEY);
      if (stored !== null) return parseFloat(stored);
    } catch { }
    return 500.0; // Default mock: 500 ShelbyUSD
  }

  function setMockBalance(amount) {
    localStorage.setItem(MOCK_BALANCE_KEY, amount.toString());
  }

  // ─── Check ShelbyUSD Sufficiency ────────────────────────────────────────────
  function checkShelbySufficiency(balance) {
    if (balance <= 0) return { ok: false, code: TESTNET_ERRORS.MISSING_SHELBY_USD, label: 'MISSING' };
    if (balance < TESTNET_CONFIG.THRESHOLDS.MIN_SHELBY_USD) return { ok: false, code: TESTNET_ERRORS.MISSING_SHELBY_USD, label: 'INSUFFICIENT' };
    if (balance < TESTNET_CONFIG.THRESHOLDS.LOW_SHELBY_WARNING) return { ok: true, code: TESTNET_ERRORS.LOW_SHELBY_BALANCE, label: 'LOW' };
    return { ok: true, code: null, label: 'READY' };
  }

  // ─── Can Afford Upload ─────────────────────────────────────────────────────
  function canAffordUpload(balance, fileSizeBytes) {
    const cost = estimateCost(fileSizeBytes);
    return {
      canAfford: balance >= cost,
      cost,
      balance,
      shortfall: Math.max(0, cost - balance)
    };
  }

  // ─── Estimate Upload Cost ───────────────────────────────────────────────────
  function estimateCost(fileSizeBytes) {
    const sizeMB = fileSizeBytes / (1024 * 1024);
    const cost = sizeMB * TESTNET_CONFIG.SHELBY.UPLOAD_COST_PER_MB;
    return Math.max(cost, 0.01); // minimum 0.01 ShelbyUSD
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPLOAD BLOB
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Returns: { fileId, blobId, blobName, provider, txHash, status, cost, timestamp }
  //
  async function uploadBlob(encryptedBytes, metadata, onProgress) {
    if (TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY) {
      return _realUpload(encryptedBytes, metadata, onProgress);
    }
    return _mockUpload(encryptedBytes, metadata, onProgress);
  }

  // ─── Real Upload (3-step Shelby process) ────────────────────────────────────
  async function _realUpload(encryptedBytes, metadata, onProgress) {
    const sdk = _getSDK();
    const apiKey = _getApiKey();

    // Verify wallet is connected (we need it for on-chain registration)
    if (!window.aptos) {
      throw new Error('Petra wallet not found. Install Petra and connect it first.');
    }

    const account = await window.aptos.account();
    if (!account || !account.address) {
      throw new Error('Wallet not connected. Connect Petra wallet first.');
    }

    // Generate a unique blob name (not the original filename, since data is encrypted)
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const blobName = metadata.fileName
      ? `cipher_${timestamp}_${randomSuffix}_${metadata.fileName}`
      : `cipher_${timestamp}_${randomSuffix}.bin`;

    if (onProgress) onProgress(5);

    // ── Step 1: File Encoding ─────────────────────────────────────────────────
    // Split file into chunks, generate commitment hashes via erasure coding.
    console.log('[ShelbyService] Step 1/3: Encoding file...');

    const data = (typeof Buffer !== 'undefined' && Buffer.isBuffer(encryptedBytes))
      ? encryptedBytes
      : Buffer.from(encryptedBytes);

    const erasureProvider = await sdk.createDefaultErasureCodingProvider();
    const commitments = await sdk.generateCommitments(erasureProvider, data);

    if (onProgress) onProgress(30);

    // ── Step 2: On-Chain Registration ─────────────────────────────────────────
    // Submit an Aptos transaction to register the blob metadata on-chain.
    // This requires APT for gas + ShelbyUSD for the storage fee.
    console.log('[ShelbyService] Step 2/3: Registering on-chain...');

    const payload = sdk.ShelbyBlobClient.createRegisterBlobPayload({
      account: account.address,
      blobName: blobName,
      blobMerkleRoot: commitments.blob_merkle_root,
      numChunksets: sdk.expectedTotalChunksets(commitments.raw_data_size),
      expirationMicros: (1000 * 60 * 60 * 24 * 30 + Date.now()) * 1000, // 30 days
      blobSize: commitments.raw_data_size,
    });

    if (onProgress) onProgress(40);

    // Sign and submit via Petra (the user will see a Petra popup)
    const txResult = await window.aptos.signAndSubmitTransaction({ data: payload });

    if (onProgress) onProgress(55);

    // Wait for transaction confirmation
    const aptosApiKey = TESTNET_CONFIG.SHELBY.APTOS_API_KEY;
    const aptosConfig = { network: sdk.Network.TESTNET };
    if (aptosApiKey) {
      aptosConfig.clientConfig = { API_KEY: aptosApiKey };
    }
    const aptosClient = new sdk.Aptos(new sdk.AptosConfig(aptosConfig));
    await aptosClient.waitForTransaction({ transactionHash: txResult.hash });

    if (onProgress) onProgress(70);

    // ── Step 3: RPC Upload ────────────────────────────────────────────────────
    // Upload the actual file data to Shelby storage providers.
    // The RPC validates against the on-chain registration before accepting.
    console.log('[ShelbyService] Step 3/3: Uploading to Shelby RPC...');

    const shelbyClient = new sdk.ShelbyClient({
      network: sdk.Network.TESTNET,
      apiKey: apiKey,
    });

    await shelbyClient.rpc.putBlob({
      account: account.address,
      blobName: blobName,
      blobData: new Uint8Array(encryptedBytes),
    });

    if (onProgress) onProgress(100);

    console.log('[ShelbyService] ✓ Upload complete:', blobName);

    // Construct the composite fileId (address/blobName) for download
    const fileId = `${account.address}/${blobName}`;

    return {
      fileId: fileId,
      blobId: account.address,
      blobName: blobName,
      provider: 'shelby-testnet',
      txHash: txResult.hash,
      status: 'completed',
      cost: estimateCost(encryptedBytes.byteLength || encryptedBytes.length),
      timestamp: Date.now()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD BLOB
  // ═══════════════════════════════════════════════════════════════════════════
  //
  async function downloadBlob(fileId) {
    if (TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY) {
      return _realDownload(fileId);
    }
    return _mockDownload(fileId);
  }

  // ─── Real Download (simple HTTP GET, no SDK needed) ─────────────────────────
  async function _realDownload(fileId) {
    // fileId format for real uploads: "{walletAddress}/{blobName}"
    // Legacy mock format: "cipher_xxxxx" (no slash)

    if (!fileId.includes('/')) {
      // Legacy mock ID — try localStorage first (backward compat)
      const localData = localStorage.getItem(fileId);
      if (localData) {
        console.log('[ShelbyService] Download: found legacy mock data in localStorage');
        return _fromBase64(localData);
      }
      throw new Error(
        'This file was uploaded in mock mode and cannot be downloaded from Shelby testnet. ' +
        'Real Shelby file IDs have the format: {walletAddress}/{blobName}'
      );
    }

    // Parse address and blob name from fileId
    const slashIndex = fileId.indexOf('/');
    const address = fileId.substring(0, slashIndex);
    const blobName = fileId.substring(slashIndex + 1);

    const url = `${TESTNET_CONFIG.SHELBY.API_URL}/shelby/v1/blobs/${address}/${blobName}`;
    console.log('[ShelbyService] Downloading from Shelby:', url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Shelby download failed: ${response.status} ${response.statusText}. ` +
        `URL: ${url}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOCK IMPLEMENTATIONS (localStorage-based)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Generate Mock Blob ID ──────────────────────────────────────────────────
  async function _generateMockBlobId(encryptedBytes) {
    try {
      const hash = await crypto.subtle.digest('SHA-256', encryptedBytes);
      return '0x' + Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }

  // ─── Generate Mock Tx Hash ─────────────────────────────────────────────────
  function _generateMockTxHash() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ─── Mock Upload ────────────────────────────────────────────────────────────
  async function _mockUpload(encryptedBytes, metadata, onProgress) {
    const totalSteps = 10;
    for (let i = 1; i <= totalSteps; i++) {
      await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
      if (onProgress) onProgress(Math.round((i / totalSteps) * 100));
    }

    // Generate file ID
    const randomBytes = crypto.getRandomValues(new Uint8Array(12));
    const id = BRAND.FILE_PREFIX + _toBase64(randomBytes)
      .replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);

    // Generate mock blobId and txHash for explorer integration
    const blobId = await _generateMockBlobId(encryptedBytes);
    const txHash = _generateMockTxHash();

    // Store in localStorage (mock persistence)
    localStorage.setItem(id, _toBase64(encryptedBytes));

    // Deduct mock ShelbyUSD balance
    const cost = estimateCost(encryptedBytes.byteLength || encryptedBytes.length);
    const currentBalance = getMockBalance();
    setMockBalance(Math.max(0, currentBalance - cost));

    return {
      fileId: id,
      blobId: blobId,
      blobName: null,
      provider: 'mock-local',
      txHash: txHash,
      status: 'completed',
      cost: cost,
      timestamp: Date.now()
    };
  }

  // ─── Mock Download ──────────────────────────────────────────────────────────
  async function _mockDownload(fileId) {
    await new Promise(r => setTimeout(r, 900));
    const data = localStorage.getItem(fileId);
    if (!data) throw new Error('FILE_NOT_FOUND: No file exists with this ID.');
    return _fromBase64(data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function getProviderLabel() {
    if (TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY) {
      return _isSDKReady() ? 'shelby-testnet' : 'shelby-testnet (SDK loading...)';
    }
    return 'mock-local';
  }

  function isRealProvider() {
    return TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY && _isSDKReady();
  }

  function isRealBalance() {
    return TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY_BALANCE;
  }

  function clearMockBalance() {
    localStorage.removeItem(MOCK_BALANCE_KEY);
  }

  // ─── Explorer URL Helpers ───────────────────────────────────────────────────
  function getExplorerBaseUrl() {
    return TESTNET_CONFIG.SHELBY.EXPLORER_URL + '/testnet';
  }

  function getExplorerBlobUrl(accountAddress, blobName) {
    if (!accountAddress) return null;
    let url = `${getExplorerBaseUrl()}/blobs/${accountAddress}`;
    if (blobName) url += `?blobName=${encodeURIComponent(blobName)}`;
    return url;
  }

  function getExplorerAccountUrl(accountAddress) {
    if (!accountAddress) return null;
    return `${getExplorerBaseUrl()}/account/${accountAddress}/blobs`;
  }

  function getExplorerEventsUrl() {
    return `${getExplorerBaseUrl()}/events`;
  }

  // ─── Download URL Helper (for real mode) ────────────────────────────────────
  function getDirectDownloadUrl(address, blobName) {
    return `${TESTNET_CONFIG.SHELBY.API_URL}/shelby/v1/blobs/${address}/${blobName}`;
  }

  function truncateId(id, startChars = 6, endChars = 5) {
    if (!id) return '';
    if (id.length <= startChars + endChars + 3) return id;
    return id.slice(0, startChars) + '...' + id.slice(-endChars);
  }

  // ─── Integration Status ─────────────────────────────────────────────────────
  // Returns a diagnostic object for the dev panel
  function getIntegrationStatus() {
    return {
      mode: TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY ? 'real' : 'mock',
      sdkLoaded: _isSDKReady(),
      sdkError: window._ShelbySDK ? window._ShelbySDK.error || null : 'SDK bridge not loaded',
      apiKeySet: !!TESTNET_CONFIG.SHELBY.API_KEY,
      apiUrl: TESTNET_CONFIG.SHELBY.API_URL,
    };
  }

  return {
    getBalance,
    getMockBalance,
    setMockBalance,
    clearMockBalance,
    checkShelbySufficiency,
    canAffordUpload,
    estimateCost,
    uploadBlob,
    downloadBlob,
    getProviderLabel,
    isRealProvider,
    isRealBalance,
    getExplorerBaseUrl,
    getExplorerBlobUrl,
    getExplorerAccountUrl,
    getExplorerEventsUrl,
    getDirectDownloadUrl,
    truncateId,
    getIntegrationStatus,
  };
})();
