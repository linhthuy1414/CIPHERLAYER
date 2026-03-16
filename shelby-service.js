// ═══════════════════════════════════════════════════════════════════════════════
// shelby-service.js — Shelby Testnet Blob Storage for CipherLayer
//
// HƯỚNG DẪN LẤY API KEY:
// 1. Truy cập https://docs.shelby.xyz/sdks/typescript/acquire-api-keys
// 2. Tạo hoặc đăng nhập tài khoản trên Shelby Portal.
// 3. Trong phần API Keys, chọn Create New Key.
// 4. Lưu lại API Key và thiết lập vào biến môi trường hoặc cấu hình (TESTNET_CONFIG.SHELBY.API_KEY).
// ═══════════════════════════════════════════════════════════════════════════════

const ShelbyService = (() => {
  const MOCK_BALANCE_KEY = 'cipherlayer_mock_shelby_balance';

  // ─── Helpers ──────────────────────────────────────────────────────────────
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

  // Lấy SDK từ bridge (đã được load bởi sdk-bridge.js qua Vite)
  async function loadShelbySDK() {
    if (window._ShelbySDK && window._ShelbySDK.ready) {
        return window._ShelbySDK;
    }
    
    // Nếu bridge chưa kịp load, chờ tối đa 5s
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (window._ShelbySDK && window._ShelbySDK.ready) {
                clearInterval(interval);
                resolve(window._ShelbySDK);
            } else if (attempts >= 50) { // 5s timeout
                clearInterval(interval);
                reject(new Error('Chưa thể tải thư viện Shelby từ SDK Bridge. Vui lòng kiểm tra kết nối mạng hoặc refresh trang.'));
            }
        }, 100);
    });
  }

  // ─── Balance & Cost ───────────────────────────────────────────────────────
  // ShelbyUSD is a Fungible Asset on Aptos testnet (NOT a Coin module).
  // Must use 0x1::primary_fungible_store::balance with the FA metadata address.
  // Proven by audit: raw=99971776, decimals=8 → 0.9997 ShelbyUSD
  async function getBalance(walletAddress) {
    if (!TESTNET_CONFIG || !TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY_BALANCE) {
      return getMockBalance();
    }

    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.startsWith('0x')) {
      console.warn('[ShelbyService] getBalance: invalid address, using mock');
      return getMockBalance();
    }

    const faMetadata = TESTNET_CONFIG.SHELBY.TOKEN.faMetadataAddress;
    if (!faMetadata) {
      console.warn('[ShelbyService] getBalance: no FA metadata address configured, using mock');
      return getMockBalance();
    }

    try {
      const viewUrl = `${TESTNET_CONFIG.APTOS.NODE_URL}/view`;
      console.log('[ShelbyService] getBalance: fetching via view function for', walletAddress.slice(0, 14) + '...');

      const response = await fetch(viewUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          function: '0x1::primary_fungible_store::balance',
          type_arguments: ['0x1::fungible_asset::Metadata'],
          arguments: [walletAddress, faMetadata]
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const raw = parseInt(data[0], 10);
          const balance = raw / Math.pow(10, TESTNET_CONFIG.SHELBY.TOKEN.decimals);
          console.log('[ShelbyService] getBalance (view fn):', balance.toFixed(4), 'ShelbyUSD (raw:', data[0], ')');
          return balance;
        }
      } else {
        const errText = await response.text().catch(() => '');
        console.warn('[ShelbyService] getBalance: view function returned', response.status, errText.slice(0, 200));
      }
    } catch (err) {
      console.warn('[ShelbyService] getBalance: fetch error:', err.message);
    }

    // Fallback to mock if real fetch fails
    console.warn('[ShelbyService] getBalance: real fetch failed, using mock');
    return getMockBalance();
  }

  function isRealBalance() {
    return TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY_BALANCE;
  }

  function getMockBalance() {
    try {
      const stored = localStorage.getItem(MOCK_BALANCE_KEY);
      if (stored !== null) return parseFloat(stored);
    } catch { }
    return 500.0;
  }

  function setMockBalance(amount) {
    localStorage.setItem(MOCK_BALANCE_KEY, amount.toString());
  }
  
  function clearMockBalance() {
    localStorage.removeItem(MOCK_BALANCE_KEY);
  }

  function estimateCost(fileSizeBytes) {
    const sizeMB = fileSizeBytes / (1024 * 1024);
    const cost = sizeMB * (TESTNET_CONFIG?.SHELBY?.UPLOAD_COST_PER_MB || 0.1);
    return Math.max(cost, 0.01);
  }

  // ─── Upload Interface ─────────────────────────────────────────────────────
  // Trả về: { fileId, blobId, blobName, txHash, url, provider, cost, status }
  async function uploadBlob(encryptedBytes, metadata, onProgress) {
    if (TESTNET_CONFIG && TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY) {
        return await _realUpload(encryptedBytes, metadata, onProgress);
    } else {
        return await _mockUpload(encryptedBytes, metadata, onProgress);
    }
  }

  // ─── Download Interface ───────────────────────────────────────────────────
  // Trả về: Uint8Array encryptedData
  async function downloadBlob(blobId) {
    if (TESTNET_CONFIG && TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY) {
        return await _realDownload(blobId);
    } else {
        return await _mockDownload(blobId);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // THỰC HIỆN SDK THẬT (REAL MODE)
  // ═════════════════════════════════════════════════════════════════════════
  async function _realUpload(encryptedBytes, metadata, onProgress) {
    // 1. Kiểm tra Adapter thay vì window.aptos
    const accountInfo = await AptosService.getAccount();
    if (!accountInfo || !accountInfo.address) {
        throw new Error('Bạn chưa kết nối ví Aptos. Vui lòng kết nối Petra hoặc ví chuẩn AIP-62.');
    }

    try {
        if (typeof AccessLog !== 'undefined') {
            AccessLog.add(ACTION_TYPES?.SHELBY_UPLOAD_STARTED || 'SHELBY_UPLOAD_STARTED', { 
               message: `Shelby upload started for ${metadata.fileName}` 
            });
        }
        
        const sdk = await loadShelbySDK();
        
        const accountAddress = accountInfo.address;
        const fileName = metadata.fileName || ('cipher_' + Date.now() + '.bin');

        // BƯỚC 1 - Encode file
        console.log('[Shelby] BƯỚC 1: Encode file');
        if (onProgress) onProgress(10);
        // SDK Bridge sẽ tự động polyfill window.Buffer nếu cần
        const data = window.Buffer ? window.Buffer.from(encryptedBytes) : new Uint8Array(encryptedBytes);
        const provider = await sdk.createDefaultErasureCodingProvider();
        const commitments = await sdk.generateCommitments(provider, data);

        // BƯỚC 2 - Register on-chain
        console.log('[Shelby] BƯỚC 2: Register on-chain');
        if (onProgress) onProgress(40);
        const payload = sdk.ShelbyBlobClient.createRegisterBlobPayload({
            account: accountAddress,
            blobName: fileName,
            blobMerkleRoot: commitments.blob_merkle_root,
            numChunksets: sdk.expectedTotalChunksets(commitments.raw_data_size),
            expirationMicros: ((Date.now() + 1000 * 60 * 60 * 24 * 30) * 1000).toString(), 
            blobSize: String(commitments.raw_data_size),
            encoding: 0, // MUST pass encoding (enumIndex 0 is default ClayCode_16_10_13), otherwise arg 6 is undefined -> Type Mismatch
        });

        // ─── DEBUG VÀ PATCH ARGUMENTS CHO PETRA ──────────────────────────────
        const argsList = payload.functionArguments || payload.arguments || [];
        console.log('[Shelby] CREATE_PAYLOAD: functionArguments length:', argsList.length);
        argsList.forEach((arg, i) => {
           console.log(`[Shelby] Arg ${i}: type = ${typeof arg}, isArray = ${Array.isArray(arg)}, val =`, arg);
        });

        // Ép kiểu toàn bộ arguments có dạng number/bigint sang string để tránh Petra "Type mismatch"
        if (payload.functionArguments) {
             payload.functionArguments = payload.functionArguments.map(arg => {
                 if (typeof arg === 'bigint' || typeof arg === 'number') return arg.toString();
                 return arg;
             });
        }
        if (payload.arguments) {
             payload.arguments = payload.arguments.map(arg => {
                 if (typeof arg === 'bigint' || typeof arg === 'number') return arg.toString();
                 return arg;
             });
        }
        console.log('[Shelby] PATCHED PAYLOAD:', payload);
        // ───────────────────────────────────────────────────────────────────

        // Ký và Submit Transaction qua AptosService Adapter chuẩn AIP-62
        const txResult = await AptosService.signAndSubmitTransaction(payload);
        
        // Chờ confirm qua Aptos REST API
        if (onProgress) onProgress(60);
        const aptosClient = new sdk.Aptos(new sdk.AptosConfig({ network: sdk.Network.TESTNET }));
        await aptosClient.waitForTransaction({ transactionHash: txResult.hash });

        // BƯỚC 3 - Upload RPC
        console.log('[Shelby] BƯỚC 3: Upload RPC');
        if (onProgress) onProgress(80);
        
        const apiKey = TESTNET_CONFIG?.SHELBY?.API_KEY;
        if (!apiKey) {
            throw new Error('Thiếu API_KEY. Hãy đọc hướng dẫn lấy API key ở đầu file.');
        }

        const shelbyClient = new sdk.ShelbyClient({ 
            network: sdk.Network.TESTNET, 
            apiKey: apiKey 
        });

        await shelbyClient.rpc.putBlob({
            account: accountAddress,
            blobName: fileName,
            blobData: new Uint8Array(encryptedBytes),
        });

        if (onProgress) onProgress(100);

        // BlobId để share cho phép format url pattern: /blobs/{address}/{fileName}
        // Ta encode cả hai để download helper có thể đọc link đúng cách
        const blobId = `${accountAddress}/${fileName}`;
        
        if (typeof AccessLog !== 'undefined') {
             AccessLog.add(ACTION_TYPES?.SHELBY_UPLOAD_COMPLETED || 'SHELBY_UPLOAD_COMPLETED', { 
                 message: `Shelby upload completed: ${blobId}` 
             });
        }
        
        return {
            fileId: blobId,     // Cẩn thiết cho CipherLayer App structure
            blobId: blobId,     
            blobName: fileName,
            txHash: txResult.hash,
            url: `https://api.testnet.shelby.xyz/shelby/v1/blobs/${blobId}`,
            provider: 'shelby-testnet',
            cost: estimateCost(encryptedBytes.byteLength || encryptedBytes.length),
            status: 'completed',
            timestamp: Date.now()
        };

    } catch (err) {
        if (typeof AccessLog !== 'undefined') {
             AccessLog.add(ACTION_TYPES?.SHELBY_UPLOAD_FAILED || 'SHELBY_UPLOAD_FAILED', { 
                 message: `Shelby upload failed: ${err.message}` 
             });
        }
        throw err;
    }
  }

  async function _realDownload(blobId) {
    // BlobId định dạng đã encode: {address}/{fileName}
    if (!blobId.includes('/')) {
        // Fallback for mock uploads
        return _mockDownload(blobId);
    }
    
    if (typeof AccessLog !== 'undefined') {
         AccessLog.add(ACTION_TYPES?.SHELBY_DOWNLOAD_STARTED || 'SHELBY_DOWNLOAD_STARTED', { 
             message: `Shelby download started: ${blobId}` 
         });
    }

    try {
        const url = `https://api.testnet.shelby.xyz/shelby/v1/blobs/${blobId}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Download lỗi từ Shelby: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        
        if (typeof AccessLog !== 'undefined') {
             AccessLog.add(ACTION_TYPES?.SHELBY_DOWNLOAD_COMPLETED || 'SHELBY_DOWNLOAD_COMPLETED', { 
                 message: `Shelby download completed: ${blobId}` 
             });
        }
        
        return new Uint8Array(arrayBuffer);
    } catch (err) {
        console.error('Lỗi khi download từ Shelby:', err);
        throw err;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // MOCK MODE (LOCAL STORAGE)
  // ═════════════════════════════════════════════════════════════════════════
  async function _mockUpload(encryptedBytes, metadata, onProgress) {
    const totalSteps = 10;
    for (let i = 1; i <= totalSteps; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (onProgress) onProgress(i * 10);
    }

    const id = 'cipher_mock_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem(id, _toBase64(encryptedBytes));

    const cost = estimateCost(encryptedBytes.byteLength || encryptedBytes.length);
    let currentBal = parseFloat(localStorage.getItem(MOCK_BALANCE_KEY) || 500);
    localStorage.setItem(MOCK_BALANCE_KEY, Math.max(0, currentBal - cost).toString());

    return {
      fileId: id,
      blobId: id,
      provider: 'mock-local',
      status: 'completed',
      cost: cost,
      timestamp: Date.now()
    };
  }

  async function _mockDownload(fileId) {
    await new Promise(r => setTimeout(r, 600));
    const data = localStorage.getItem(fileId);
    if (!data) throw new Error('FILE_NOT_FOUND: Tệp không tồn tại trong mock local.');
    return _fromBase64(data);
  }

  // Helper functions exposed for app.js UI logic
  function checkShelbySufficiency(balance) {
    if (balance <= 0) return { ok: false, code: 'MISSING_SHELBY_USD', label: 'MISSING' };
    return { ok: true, code: null, label: 'READY' };
  }

  function canAffordUpload(balance, fileSizeBytes) {
    const cost = estimateCost(fileSizeBytes);
    return { canAfford: balance >= cost, cost, balance };
  }

  function getProviderLabel() {
    return (TESTNET_CONFIG && TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY) ? 'shelby-testnet' : 'mock-local';
  }

  function getDirectDownloadUrl(address, blobName) {
    return `https://api.testnet.shelby.xyz/shelby/v1/blobs/${address}/${blobName}`;
  }
  
  function truncateId(id, startChars = 6, endChars = 5) {
      if (!id) return '';
      if (id.length <= startChars + endChars + 3) return id;
      return id.slice(0, startChars) + '...' + id.slice(-endChars);
  }

  // To maintain compatibility with previously implemented functions in app.js missing here
  function isRealProvider() {
    return TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY;
  }
  
  function getExplorerBaseUrl() {
    return TESTNET_CONFIG?.SHELBY?.EXPLORER_URL + '/testnet';
  }

  function getExplorerBlobUrl(blobId, blobName) {
    if (!blobId) return null;
    if (blobId.includes('/')) {
         const parts = blobId.split('/');
         return `${getExplorerBaseUrl()}/blobs/${parts[0]}?blobName=${encodeURIComponent(parts[1])}`;
    }
    let url = `${getExplorerBaseUrl()}/blobs/${blobId}`;
    if (blobName) url += `?blobName=${encodeURIComponent(blobName)}`;
    return url;
  }

  function getIntegrationStatus() {
     return {
         mode: TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY ? 'real' : 'mock',
         sdkLoaded: !!window._ShelbySDK,
         apiKeySet: !!TESTNET_CONFIG?.SHELBY?.API_KEY,
         apiUrl: TESTNET_CONFIG?.SHELBY?.API_URL,
     }
  }

  async function getAccountBlobs(accountAddress) {
    if (!TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY) {
      return [];
    }
    const sdk = await loadShelbySDK();
    const apiKey = TESTNET_CONFIG?.SHELBY?.API_KEY;
    if (!apiKey) {
      console.warn('[Shelby] getAccountBlobs: Missing API KEY');
      return [];
    }
    try {
      // Create ShelbyBlobClient
      const blobClient = new sdk.ShelbyBlobClient({
         network: sdk.Network.TESTNET,
         apiKey: apiKey, 
         aptos: {
            network: sdk.Network.TESTNET,
         }
      });
      const addr = sdk.AccountAddress.fromString(accountAddress);
      const blobs = await blobClient.getAccountBlobs({ account: addr });
      return blobs || [];
    } catch(err) {
      console.error('[Shelby] getAccountBlobs Error:', err);
      return [];
    }
  }

  return {
    uploadBlob,
    downloadBlob,
    getBalance,
    getAccountBlobs,
    getMockBalance,
    setMockBalance,
    clearMockBalance,
    estimateCost,
    checkShelbySufficiency,
    canAffordUpload,
    getProviderLabel,
    getDirectDownloadUrl,
    truncateId,
    isRealProvider,
    isRealBalance,
    getExplorerBaseUrl,
    getExplorerBlobUrl,
    getIntegrationStatus
  };
})();
