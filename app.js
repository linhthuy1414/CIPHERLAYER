// ═══════════════════════════════════════════════════════════════════════════════
// app.js — CipherLayer: Secure Encrypted File Relay v2.2-testnet
// Features: upload, download, vault, search, filter, revoke, integrity hash,
//           access log, statistics, panic wipe, wallet connect, wallet-gated
//           sharing, inbox/inbound relay, Aptos+Shelby testnet integration
// ═══════════════════════════════════════════════════════════════════════════════

// ─── State ───────────────────────────────────────────────────────────────────
let decryptedBlob = null;
let decryptedFileName = '';
let selectedExpiration = 'never';
let currentVaultFilter = 'all';
let selectedAccessMode = 'passphrase';

// ─── Testnet Balance State ───────────────────────────────────────────────────
let cachedAptBalance = null;
let cachedShelbyBalance = null;
let lastBalanceCheck = 0;
let lastUploadStatus = null;  // { status, fileId, provider, timestamp, error? }

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`${tab}-tab`).classList.remove('hidden');
  hideStatus();
  if (tab === 'history') {
    renderHistory();
    renderVaultStats();
    renderAccessLog();
    renderDiagnostics();
  }
  if (tab === 'inbox') {
    renderInbox();
  }
  if (tab === 'upload') {
    renderUploadReadiness();
  }
}

// ─── Auto-detect share link on load ──────────────────────────────────────────
(function checkUrlForShareLink() {
  const params = new URLSearchParams(window.location.search);
  const fileId = params.get('file');
  if (fileId) {
    setTimeout(() => {
      switchTab('download');
      document.getElementById('downloadFileId').value = fileId;
      showStatus('> Share link detected. Enter decrypt key and download.', 'info');
    }, 300);
  }
})();

// ─── Restore wallet session + testnet init on load ───────────────────────────
(function initApp() {
  console.log('[CipherLayer] initApp: booting...');
  console.log('[CipherLayer] Globals check:', {
    TESTNET_CONFIG: typeof TESTNET_CONFIG !== 'undefined',
    WalletSession: typeof WalletSession !== 'undefined',
    AptosService: typeof AptosService !== 'undefined',
    ShelbyService: typeof ShelbyService !== 'undefined',
    VaultHistory: typeof VaultHistory !== 'undefined',
  });
  setTimeout(() => {
    console.log('[CipherLayer] initApp: Petra detection =', typeof AptosService !== 'undefined' ? AptosService.isPetraInstalled() : 'AptosService N/A');
    console.log('[CipherLayer] initApp: stored session =', typeof WalletSession !== 'undefined' ? !!WalletSession.getSession() : 'WalletSession N/A');
    renderWalletUI();
    initTestnetUI();
    // Restore balances if wallet was connected
    const session = WalletSession.getSession();
    if (session) {
      console.log('[CipherLayer] initApp: restoring session for', session.walletType, session.isReal ? '[REAL]' : '[MOCK]');
      refreshBalances();
    }
  }, 100);
})();


function initTestnetUI() {
  // Set provider label
  const provLabel = document.getElementById('uploadProviderLabel');
  if (provLabel) {
    provLabel.textContent = 'UPLOAD: ' + ShelbyService.getProviderLabel().toUpperCase();
  }
  // Set faucet links
  const aptFaucet = document.getElementById('aptFaucetLink');
  const shelbyFaucet = document.getElementById('shelbyFaucetLink');
  if (aptFaucet) aptFaucet.href = TESTNET_CONFIG.FAUCETS.APT;
  if (shelbyFaucet) shelbyFaucet.href = TESTNET_CONFIG.FAUCETS.SHELBY;
  // Log testnet mode
  AccessLog.add(ACTION_TYPES.TESTNET_MODE_ENABLED, {
    message: `Testnet mode: Aptos=${TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_PETRA ? 'REAL' : 'MOCK'} Shelby=${TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY ? 'REAL' : 'MOCK'}`
  });
}

// ─── Drop zone (multi-file) ──────────────────────────────────────────────────
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    FileQueue.addFiles(e.dataTransfer.files);
  }
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    FileQueue.addFiles(fileInput.files);
    fileInput.value = '';
  }
});

// ─── File Queue UI ───────────────────────────────────────────────────────────
FileQueue.onUpdate(renderFileQueue);

function renderFileQueue(queue) {
  const container = document.getElementById('fileQueueContainer');
  const list = document.getElementById('fileQueueList');

  if (!queue || queue.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  list.innerHTML = queue.map(item => {
    const statusClass = item.status;
    const statusLabel = item.status.toUpperCase();
    const progressClass = item.status === 'completed' ? 'completed' 
                        : item.status === 'failed' ? 'failed'
                        : item.status === 'uploading' ? 'uploading' 
                        : item.status === 'encrypting' ? 'encrypting' : '';
    const progressWidth = item.status === 'completed' ? 100 
                        : item.status === 'uploading' ? item.uploadProgress 
                        : item.status === 'encrypting' ? item.encryptProgress 
                        : 0;
    const showRemove = item.status === 'queued';
    const progressLabel = item.status === 'encrypting' ? `ENCRYPT ${item.encryptProgress}%`
                        : item.status === 'uploading' ? `UPLOAD ${item.uploadProgress}%`
                        : statusLabel;
    
    return `
      <div class="queue-item">
        <div class="queue-item-header">
          <span class="queue-item-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</span>
          <span class="queue-item-size">${formatSize(item.file.size)}</span>
          ${showRemove ? `<button class="queue-item-remove" onclick="removeFromQueue('${item.id}')">[✕]</button>` : ''}
        </div>
        <div class="queue-item-status ${statusClass}"> ${progressLabel}${item.error ? ': ' + escapeHtml(item.error) : ''}</div>
        <div class="progress-bar-container">
          <div class="progress-bar ${progressClass}" style="width:${progressWidth}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function removeFromQueue(id) {
  FileQueue.removeFile(id);
}

function clearQueue() {
  FileQueue.clear();
  document.getElementById('uploadResults').innerHTML = '';
}

// ─── Expiration selector ─────────────────────────────────────────────────────
document.getElementById('expirationOptions').addEventListener('click', e => {
  const btn = e.target.closest('.exp-btn');
  if (!btn) return;
  document.querySelectorAll('#expirationOptions .exp-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedExpiration = btn.dataset.value;
});

// ─── Access Mode selector ────────────────────────────────────────────────────
document.getElementById('accessModeOptions').addEventListener('click', e => {
  const btn = e.target.closest('.exp-btn');
  if (!btn) return;
  document.querySelectorAll('#accessModeOptions .exp-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedAccessMode = btn.dataset.value;

  // Show/hide recipient wallet input
  const recipientGroup = document.getElementById('recipientWalletGroup');
  if (selectedAccessMode === 'wallet-gated') {
    recipientGroup.classList.remove('hidden');
  } else {
    recipientGroup.classList.add('hidden');
  }
});

// ─── Passphrase Tools ────────────────────────────────────────────────────────
const uploadPasswordInput = document.getElementById('uploadPassword');

function generatePassphrase() {
  const pass = PassphraseUtil.generate();
  uploadPasswordInput.value = pass;
  uploadPasswordInput.type = 'text';
  updateStrengthIndicator();
  AccessLog.add(ACTION_TYPES.PASSPHRASE_GEN, { message: 'Passphrase generated' });
  showStatus('> Passphrase generated.', 'info');
  setTimeout(hideStatus, 2000);
}

function copyPassphrase() {
  const pass = uploadPasswordInput.value;
  if (!pass) { showStatus('> No passphrase to copy.', 'error'); return; }
  navigator.clipboard.writeText(pass).then(() => {
    AccessLog.add(ACTION_TYPES.PASSPHRASE_COPIED, { message: 'Passphrase copied to clipboard' });
    showStatus('> Passphrase copied to clipboard.', 'info');
    setTimeout(hideStatus, 2000);
  });
}

function togglePassphraseVisibility() {
  const input = uploadPasswordInput;
  input.type = input.type === 'password' ? 'text' : 'password';
  document.getElementById('togglePassVisibility').textContent = 
    input.type === 'password' ? '[👁]' : '[🔒]';
}

uploadPasswordInput.addEventListener('input', updateStrengthIndicator);

function updateStrengthIndicator() {
  const strength = PassphraseUtil.getStrength(uploadPasswordInput.value);
  const bar = document.getElementById('strengthBar');
  const label = document.getElementById('strengthLabel');
  
  const widths = { none: 0, weak: 33, medium: 66, strong: 100 };
  bar.style.width = (widths[strength.level] || 0) + '%';
  bar.style.backgroundColor = strength.color;
  
  if (strength.level === 'none') {
    label.textContent = '';
  } else {
    label.textContent = `> STRENGTH: ${strength.label}`;
    label.style.color = strength.color;
  }
}

// ─── Crypto helpers ──────────────────────────────────────────────────────────

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function generatePassword(len = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Encrypt ─────────────────────────────────────────────────────────────────
async function encryptFile(file, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);

  const fileBuffer = await file.arrayBuffer();

  const nameBytes = new TextEncoder().encode(file.name);
  const nameLenBuf = new Uint8Array(4);
  new DataView(nameLenBuf.buffer).setUint32(0, nameBytes.length);
  const plaintext = new Uint8Array([...nameLenBuf, ...nameBytes, ...new Uint8Array(fileBuffer)]);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const payload = new Uint8Array(16 + 12 + ciphertext.byteLength);
  payload.set(salt, 0);
  payload.set(iv, 16);
  payload.set(new Uint8Array(ciphertext), 28);
  return payload;
}

// ─── Decrypt ─────────────────────────────────────────────────────────────────
async function decryptPayload(payload, password) {
  const salt       = payload.slice(0, 16);
  const iv         = payload.slice(16, 28);
  const ciphertext = payload.slice(28);
  const key        = await deriveKey(password, salt);

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const plain = new Uint8Array(plaintext);

  const nameLen = new DataView(plain.buffer).getUint32(0);
  const fileName = new TextDecoder().decode(plain.slice(4, 4 + nameLen));
  const fileData = plain.slice(4 + nameLen);
  return { fileName, fileData };
}

// ─── CipherLayer Storage — now uses ShelbyService ────────────────────────────
async function cipherUpload(encryptedBytes, metadata, onProgress) {
  // Delegate to ShelbyService (mock or real based on feature flags)
  // Returns full result: { fileId, blobId, blobName, provider, txHash, status, cost, timestamp }
  return await ShelbyService.uploadBlob(encryptedBytes, metadata || {}, onProgress);
}

async function cipherDownload(fileId) {
  return ShelbyService.downloadBlob(fileId);
}

// ─── Pre-upload Testnet Checks ───────────────────────────────────────────────
async function checkUploadReadiness(totalFileSize) {
  const issues = [];

  // Check wallet connection
  if (TESTNET_CONFIG.FEATURE_FLAGS.REQUIRE_WALLET_FOR_UPLOAD) {
    if (!WalletSession.isConnected()) {
      issues.push({ code: TESTNET_ERRORS.WALLET_NOT_CONNECTED, msg: 'Wallet not connected. Connect Petra testnet wallet first.', fatal: true });
    }
  }

  // Check session signed
  if (TESTNET_CONFIG.FEATURE_FLAGS.REQUIRE_SESSION_SIGN) {
    if (!WalletSession.isSigned()) {
      issues.push({ code: TESTNET_ERRORS.SESSION_NOT_AUTHORIZED, msg: 'Session not authorized. Sign session in wallet dropdown.', fatal: true });
    }
  }

  // Check network mismatch (Petra only)
  if (TESTNET_CONFIG.FEATURE_FLAGS.REQUIRE_NETWORK_CHECK && WalletSession.isConnected()) {
    const session = WalletSession.getSession();
    if (session && session.isReal && session.walletType === 'petra') {
      const netCheck = await AptosService.verifyTestnetNetwork();
      if (!netCheck.ok) {
        issues.push({ code: TESTNET_ERRORS.NETWORK_MISMATCH, msg: `Petra is on ${netCheck.network}, expected ${netCheck.expected}. Switch network in Petra.`, fatal: true });
      }
    }
  }

  // Check balances
  if (TESTNET_CONFIG.FEATURE_FLAGS.REQUIRE_BALANCE_CHECK && WalletSession.isConnected()) {
    const addr = WalletSession.getAddress();
    const aptBal = await AptosService.getAptBalance(addr);
    const shelbyBal = await ShelbyService.getBalance(addr);
    cachedAptBalance = aptBal;
    cachedShelbyBalance = shelbyBal;
    renderBalanceUI();

    const aptCheck = AptosService.checkAptSufficiency(aptBal);
    const shelbyCheck = ShelbyService.checkShelbySufficiency(shelbyBal);

    if (!aptCheck.ok) {
      issues.push({ code: TESTNET_ERRORS.MISSING_APT_TESTNET, msg: `APT balance too low: ${aptBal.toFixed(4)} APT`, fatal: true });
      AccessLog.add(ACTION_TYPES.MISSING_APT_TESTNET, { message: `APT balance insufficient: ${aptBal.toFixed(4)} APT` });
    }
    if (!shelbyCheck.ok) {
      issues.push({ code: TESTNET_ERRORS.MISSING_SHELBY_USD, msg: `ShelbyUSD balance too low: ${shelbyBal.toFixed(2)} ShelbyUSD`, fatal: true });
      AccessLog.add(ACTION_TYPES.MISSING_SHELBY_USD, { message: `ShelbyUSD balance insufficient: ${shelbyBal.toFixed(2)}` });
    }

    // Check if balance can cover estimated upload cost
    if (shelbyCheck.ok && totalFileSize) {
      const afford = ShelbyService.canAffordUpload(shelbyBal, totalFileSize);
      if (!afford.canAfford) {
        issues.push({ code: TESTNET_ERRORS.UPLOAD_COST_EXCEEDS_BALANCE, msg: `Upload cost ~${afford.cost.toFixed(4)} ShelbyUSD exceeds balance ${shelbyBal.toFixed(2)}`, fatal: true });
      }
    }
  }

  return issues;
}

// ─── Upload flow (multi-file) ────────────────────────────────────────────────
async function encryptAndUploadAll() {
  const queue = FileQueue.getQueue();
  if (queue.length === 0) { showStatus('> Please select files first.', 'error'); return; }

  // Wallet-gated validation
  if (selectedAccessMode === 'wallet-gated') {
    const recipientAddr = document.getElementById('recipientWallet').value.trim();
    if (!recipientAddr) {
      showStatus('> WALLET-GATED: Please enter recipient wallet address.', 'error');

      return;
    }
  }

  // Testnet readiness checks (gated by feature flags)
  const totalFileSize = queue.reduce((s, q) => s + (q.file.size || 0), 0);
  const issues = await checkUploadReadiness(totalFileSize);
  const fatal = issues.filter(i => i.fatal);
  if (fatal.length > 0) {
    const msgs = fatal.map(i => `${i.code}: ${i.msg}`).join(' | ');
    showStatus(`> UPLOAD_BLOCKED: ${msgs}`, 'error');
    lastUploadStatus = { status: 'blocked', error: msgs, timestamp: Date.now() };
    return;
  }
  const pwdInput = uploadPasswordInput.value.trim();
  const password = pwdInput || generatePassword();

  if (!pwdInput) {
    uploadPasswordInput.value = password;
    uploadPasswordInput.type = 'text';
    updateStrengthIndicator();
  }

  const uploadBtn = document.getElementById('encryptUploadBtn');
  uploadBtn.disabled = true;

  const resultsContainer = document.getElementById('uploadResults');
  const recipientWallet = selectedAccessMode === 'wallet-gated'
    ? document.getElementById('recipientWallet').value.trim()
    : null;
  const createdByWallet = WalletSession.getAddress() || null;

  for (const item of queue) {
    if (item.status !== 'queued') continue;

    try {
      // ENCRYPT phase
      FileQueue.updateItem(item.id, { status: 'encrypting', encryptProgress: 0 });
      
      const encryptSteps = 5;
      for (let i = 1; i <= encryptSteps; i++) {
        await new Promise(r => setTimeout(r, 60 + Math.random() * 80));
        FileQueue.updateItem(item.id, { encryptProgress: Math.round((i / encryptSteps) * 100) });
      }
      
      const encrypted = await encryptFile(item.file, password);
      FileQueue.updateItem(item.id, { encryptProgress: 100 });

      AccessLog.add(ACTION_TYPES.FILE_ENCRYPTED, {
        fileName: item.file.name,
        message: `Encrypted: ${item.file.name} (${formatSize(item.file.size)})`
      });

      // Compute integrity hash from original file
      const fileBuffer = await item.file.arrayBuffer();
      const integrityHash = await IntegrityUtil.computeHash(fileBuffer);

      // UPLOAD phase - Shelby Testnet
      FileQueue.updateItem(item.id, { status: 'uploading', uploadProgress: 0 });
      AccessLog.add(ACTION_TYPES.SHELBY_UPLOAD_STARTED, {
        fileName: item.file.name,
        message: `Shelby upload started: ${item.file.name} (${formatSize(item.file.size)}) [${ShelbyService.getProviderLabel()}]`
      });

      const uploadResult = await cipherUpload(encrypted, { fileName: item.file.name }, (progress) => {
        FileQueue.updateItem(item.id, { uploadProgress: progress });
      });

      const fileId = uploadResult.fileId;
      const blobId = uploadResult.blobId || null;
      const blobName = uploadResult.blobName || null;
      const txHash = uploadResult.txHash || null;
      const provider = uploadResult.provider || ShelbyService.getProviderLabel();
      const uploadCost = uploadResult.cost || null;

      const shareLink = ShareLinkUtil.generateLink(fileId);
      const now = Date.now();
      const expiresAt = ExpirationUtil.getExpiryTimestamp(selectedExpiration);

      // Save to history with full Shelby metadata
      VaultHistory.addRecord({
        fileId,
        blobId,
        blobName,
        txHash,
        provider,
        uploadCost,
        fileName: item.file.name,
        fileSize: item.file.size,
        createdAt: now,
        expiration: selectedExpiration,
        expiresAt,
        shareLink,
        status: 'active',
        downloadCount: 0,
        integrityHash,
        accessMode: selectedAccessMode,
        recipientWallet: recipientWallet,
        createdByWallet: createdByWallet
      });

      AccessLog.add(ACTION_TYPES.SHELBY_UPLOAD_COMPLETED, {
        fileId,
        fileName: item.file.name,
        message: `Shelby upload completed: ${item.file.name} -> ${fileId.slice(0, 16)}... [${provider}]`
      });

      AccessLog.add(ACTION_TYPES.FILE_UPLOADED, {
        fileId,
        fileName: item.file.name,
        message: `Uploaded: ${item.file.name} -> ${fileId.slice(0, 16)}... [${selectedAccessMode.toUpperCase()}]`
      });

      AccessLog.add(ACTION_TYPES.RECORD_PERSISTED, {
        fileId,
        fileName: item.file.name,
        message: `Vault record persisted for ${item.file.name}`
      });

      AccessLog.add(ACTION_TYPES.LINK_CREATED, {
        fileId,
        fileName: item.file.name,
        message: `Share link created for ${item.file.name}`
      });

      lastUploadStatus = { status: 'completed', fileId, blobId, txHash, provider, timestamp: Date.now() };

      FileQueue.updateItem(item.id, { 
        status: 'completed', 
        uploadProgress: 100,
        result: { fileId, shareLink, blobId, txHash }
      });

      // Render upload result card with Shelby metadata
      const expiryLabel = selectedExpiration === 'never' ? 'Never' 
                        : selectedExpiration === 'one-download' ? 'One Download'
                        : selectedExpiration.toUpperCase();

      const accessLabel = selectedAccessMode === 'wallet-gated'
        ? `Wallet-Gated -> ${WalletAdapters.shortenAddress(recipientWallet)}`
        : selectedAccessMode.charAt(0).toUpperCase() + selectedAccessMode.slice(1);

      // Build optional Shelby metadata rows
      const blobIdRow = blobId
        ? `<div class="info-row"><span>Blob ID</span><code>${ShelbyService.truncateId(blobId, 8, 6)}</code><button class="copy-btn" onclick="copyValue('${blobId}')">Copy</button></div>`
        : '';
      const txHashRow = txHash
        ? `<div class="info-row"><span>Tx Hash</span><code>${ShelbyService.truncateId(txHash, 8, 6)}</code><button class="copy-btn" onclick="copyValue('${txHash}')">Copy</button></div>`
        : '';
      const explorerUrl = blobId
        ? ShelbyService.getExplorerBlobUrl(blobId, blobName || item.file.name)
        : ShelbyService.getExplorerBaseUrl();
      const explorerRow = explorerUrl
        ? `<div class="info-row"><span>Explorer</span><a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="explorer-link">Open in Shelby Explorer</a></div>`
        : '';

      showStatus(`> Upload complete: ${item.file.name}`, 'info');
      
      resultsContainer.innerHTML += `
        <div class="upload-result-card">
          <h4>Upload Complete: ${escapeHtml(item.file.name)}</h4>
          <div class="info-row">
            <span>File ID</span>
            <code id="fid_${fileId}">${fileId}</code>
            <button class="copy-btn" onclick="copyTextContent('fid_${fileId}')">Copy</button>
          </div>
          ${blobIdRow}
          ${txHashRow}
          <div class="info-row">
            <span>Share Link</span>
            <code id="link_${fileId}">${escapeHtml(shareLink)}</code>
            <button class="copy-btn" onclick="copyAndLogLink('link_${fileId}', '${fileId}')">Copy</button>
          </div>
          <div class="info-row">
            <span>Decrypt Key</span>
            <code id="key_${fileId}">${escapeHtml(password)}</code>
            <button class="copy-btn" onclick="copyTextContent('key_${fileId}')">Copy</button>
          </div>
          <div class="info-row">
            <span>SHA-256</span>
            <code>${integrityHash.slice(0, 32)}...${integrityHash.slice(-8)}</code>
            <button class="copy-btn" onclick="copyValue('${integrityHash}')">Copy</button>
          </div>
          <div class="info-row"><span>Access</span><code>${accessLabel}</code></div>
          <div class="info-row"><span>Provider</span><code>${provider}</code></div>
          <div class="info-row"><span>Size</span><code>${formatSize(item.file.size)}</code></div>
          <div class="info-row"><span>Uploaded</span><code>${new Date(now).toLocaleString()}</code></div>
          <div class="info-row"><span>Expires</span><code>${expiryLabel}</code></div>
          ${explorerRow}
          <p class="warning">Save your decrypt key. Recovery is impossible once lost.</p>
        </div>
      `;

    } catch (e) {
      FileQueue.updateItem(item.id, { status: 'failed', error: e.message });
      AccessLog.add(ACTION_TYPES.SHELBY_UPLOAD_FAILED, {
        fileName: item.file.name,
        message: `Upload failed: ${item.file.name} — ${e.message}`
      });
      lastUploadStatus = { status: 'failed', error: e.message, timestamp: Date.now() };
    }
  }

  uploadBtn.disabled = false;
}

// ─── Copy link + log ─────────────────────────────────────────────────────────
function copyAndLogLink(elementId, fileId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    AccessLog.add(ACTION_TYPES.LINK_COPIED, {
      fileId,
      message: `Link copied for ${fileId.slice(0, 16)}...`
    });
    showStatus('> Copied to clipboard.', 'info');
    setTimeout(hideStatus, 2000);
  });
}

// ─── Download flow ────────────────────────────────────────────────────────────
async function downloadAndDecrypt() {
  const rawInput = document.getElementById('downloadFileId').value.trim();
  const password = document.getElementById('downloadKey').value.trim();
  
  document.getElementById('downloadResult').classList.add('hidden');
  document.getElementById('downloadError').classList.add('hidden');
  document.getElementById('downloadIntegrity').classList.add('hidden');

  if (!rawInput || !password) {
    showStatus('> Please enter File ID / share link and decryption key.', 'error');
    return;
  }

  const fileId = ShareLinkUtil.parseLink(rawInput);

  // Check if revoked
  const record = VaultHistory.getRecord(fileId);
  if (record && record.status === 'revoked') {
    AccessLog.add(ACTION_TYPES.DOWNLOAD_FAILED, {
      fileId,
      fileName: record.fileName,
      message: `Download blocked: link revoked for ${record.fileName}`
    });
    document.getElementById('downloadError').classList.remove('hidden');
    document.getElementById('downloadErrorMsg').textContent = 
      'LINK_REVOKED: This share link has been revoked by the owner.';
    return;
  }

  // Check wallet-gated access
  if (record && record.accessMode === 'wallet-gated' && record.recipientWallet) {
    const currentAddr = WalletSession.getAddress();
    if (!currentAddr) {
      AccessLog.add(ACTION_TYPES.WALLET_GATED_DENIED, {
        fileId,
        fileName: record.fileName,
        message: `Wallet-gated denied: no wallet connected`
      });
      document.getElementById('downloadError').classList.remove('hidden');
      document.getElementById('downloadErrorMsg').textContent = 
        'ACCESS_DENIED: This file requires wallet authentication. Connect the recipient wallet first.';
      return;
    }
    if (currentAddr !== record.recipientWallet) {
      AccessLog.add(ACTION_TYPES.WALLET_GATED_DENIED, {
        fileId,
        fileName: record.fileName,
        message: `Wallet mismatch: ${WalletAdapters.shortenAddress(currentAddr)} ≠ expected`
      });
      document.getElementById('downloadError').classList.remove('hidden');
      document.getElementById('downloadErrorMsg').textContent = 
        `WALLET_MISMATCH: Connected wallet (${WalletAdapters.shortenAddress(currentAddr)}) does not match the recipient wallet. Access denied.`;
      return;
    }
    // Wallet matches
    AccessLog.add(ACTION_TYPES.WALLET_GATED_ALLOWED, {
      fileId,
      fileName: record.fileName,
      message: `Wallet-gated access granted for ${record.fileName}`
    });
  }

  // Check expiration
  if (record && ExpirationUtil.isExpired(record)) {
    AccessLog.add(ACTION_TYPES.DOWNLOAD_FAILED, {
      fileId,
      fileName: record.fileName,
      message: `Download blocked: file expired (${record.fileName})`
    });
    document.getElementById('downloadError').classList.remove('hidden');
    document.getElementById('downloadErrorMsg').textContent = 
      record.expiration === 'one-download' 
        ? 'FILE_CONSUMED: This file was set to self-destruct after one download.'
        : 'FILE_EXPIRED: This file has passed its expiration time.';
    return;
  }

  AccessLog.add(ACTION_TYPES.DOWNLOAD_ATTEMPT, {
    fileId,
    message: `Download attempt: ${fileId.slice(0, 16)}...`
  });

  showStatus('> Connecting to CipherLayer relay...', 'info');
  try {
    const payload = await cipherDownload(fileId);
    showStatus('> Decrypting payload...', 'info');
    const { fileName, fileData } = await decryptPayload(payload, password);

    decryptedFileName = fileName;
    decryptedBlob = new Blob([fileData]);

    // Integrity verification
    if (record && record.integrityHash) {
      const verifyResult = await IntegrityUtil.verifyHash(fileData.buffer, record.integrityHash);
      const integrityEl = document.getElementById('downloadIntegrity');
      const hashEl = document.getElementById('downloadHash');
      const badgeEl = integrityEl.querySelector('.integrity-badge');
      
      integrityEl.classList.remove('hidden');
      hashEl.textContent = verifyResult.actual;
      
      if (verifyResult.match) {
        badgeEl.textContent = '> INTEGRITY_VERIFIED ✓ (SHA-256)';
        badgeEl.className = 'integrity-badge verified';
        AccessLog.add(ACTION_TYPES.INTEGRITY_VERIFIED, {
          fileId,
          fileName,
          message: `Integrity verified for ${fileName}`
        });
      } else {
        badgeEl.textContent = '> INTEGRITY_MISMATCH ✗ (SHA-256 HASH DIFFERS)';
        badgeEl.className = 'integrity-badge failed';
      }
    }

    // Increment download count for expiration tracking
    if (record) {
      VaultHistory.incrementDownloadCount(fileId);
      const updated = VaultHistory.getRecord(fileId);
      if (updated && updated.expiration === 'one-download') {
        localStorage.removeItem(fileId);
        VaultHistory.updateRecord(fileId, { status: 'consumed' });
      }
    }

    AccessLog.add(ACTION_TYPES.DOWNLOAD_SUCCESS, {
      fileId,
      fileName,
      message: `Downloaded: ${fileName} (${formatSize(fileData.byteLength)})`
    });

    document.getElementById('downloadFileName').textContent = 
      `> ${fileName} (${formatSize(fileData.byteLength)})`;
    document.getElementById('downloadResult').classList.remove('hidden');
    hideStatus();
  } catch (e) {
    const isShelbyError = e.message && (e.message.includes('Shelby') || e.message.includes('FILE_NOT_FOUND') || e.message.includes('mock mode'));
    const errorLabel = isShelbyError ? 'DOWNLOAD_FAILED' : 'DECRYPT_FAILED';
    const errorMsg = isShelbyError
      ? e.message
      : 'DECRYPT_FAILED: Wrong key or corrupted file. Verify your credentials.';
    AccessLog.add(ACTION_TYPES.DOWNLOAD_FAILED, {
      fileId,
      message: `${errorLabel}: ${e.message || 'unknown'} for ${fileId.slice(0, 16)}...`
    });
    hideStatus();
    document.getElementById('downloadError').classList.remove('hidden');
    document.getElementById('downloadErrorMsg').textContent = errorMsg;
  }
}

// ─── Save decrypted file ────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', () => {
  if (!decryptedBlob) return;
  const url = URL.createObjectURL(decryptedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = decryptedFileName;
  a.click();
  URL.revokeObjectURL(url);
});

// ═══════════════════════════════════════════════════════════════════════════════
// WALLET UI
// ═══════════════════════════════════════════════════════════════════════════════

function toggleWalletDropdown() {
  const dropdown = document.getElementById('walletDropdown');
  dropdown.classList.toggle('hidden');

  const session = WalletSession.getSession();
  const optionsEl = document.getElementById('walletOptions');
  const actionsEl = document.getElementById('walletSessionActions');

  if (session) {
    optionsEl.classList.add('hidden');
    actionsEl.classList.remove('hidden');
    renderWalletSessionInfo();
  } else {
    optionsEl.classList.remove('hidden');
    actionsEl.classList.add('hidden');
  }
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const cluster = document.getElementById('walletCluster');
  if (cluster && !cluster.contains(e.target)) {
    document.getElementById('walletDropdown').classList.add('hidden');
  }
});

function renderWalletUI() {
  const session = WalletSession.getSession();
  const disconnEl = document.getElementById('walletDisconnected');
  const connEl = document.getElementById('walletConnected');

  if (session) {
    disconnEl.classList.add('hidden');
    connEl.classList.remove('hidden');
    const meta = WALLET_META[session.walletType];
    document.getElementById('walletLabel').textContent = meta.name;
    document.getElementById('walletAddr').textContent = WalletAdapters.shortenAddress(session.address);
    const badge = document.getElementById('walletStatusBadge');
    badge.textContent = session.status;
    badge.className = 'wallet-status-badge ' + session.status.toLowerCase();

    // Update sign button
    const signBtn = document.getElementById('signSessionBtn');
    if (session.status === WALLET_SESSION_STATUS.AUTHORIZED || session.status === WALLET_SESSION_STATUS.SIGNED) {
      signBtn.classList.add('hidden');
    } else {
      signBtn.classList.remove('hidden');
    }
  } else {
    disconnEl.classList.remove('hidden');
    connEl.classList.add('hidden');
  }
}

function renderWalletSessionInfo() {
  const session = WalletSession.getSession();
  if (!session) return;
  const meta = WALLET_META[session.walletType];
  const infoEl = document.getElementById('walletSessionInfo');
  infoEl.innerHTML = `
    <div class="ws-info-row"><span class="ws-label">WALLET:</span> <span class="ws-val">${meta.icon} ${meta.name}</span></div>
    <div class="ws-info-row"><span class="ws-label">CHAIN:</span> <span class="ws-val">${meta.chain}</span></div>
    <div class="ws-info-row"><span class="ws-label">ADDRESS:</span> <span class="ws-val ws-mono">${WalletAdapters.shortenAddress(session.address)}</span></div>
    <div class="ws-info-row"><span class="ws-label">STATUS:</span> <span class="ws-val ws-status-${session.status.toLowerCase()}">${session.status}</span></div>
    ${session.signedAt ? `<div class="ws-info-row"><span class="ws-label">SIGNED:</span> <span class="ws-val">${new Date(session.signedAt).toLocaleTimeString()}</span></div>` : ''}
  `;
}

async function connectWallet(walletType) {
  const meta = WALLET_META[walletType];
  console.log('[connectWallet] called with walletType =', walletType);
  showStatus(`> Connecting to ${meta.name}...`, 'info');

  try {
    let session;

    // ─── Real Petra path ─────────────────────────────────────────────────────
    if (walletType === 'petra' && AptosService.shouldUseRealPetra()) {
      console.log('[connectWallet] Using REAL Petra connect');
      const result = await AptosService.connectPetra();
      session = WalletSession.connectReal(walletType, result.address);

      // ─── Post-connect network check (real Petra only) ──────────────────────
      try {
        const netCheck = await AptosService.verifyTestnetNetwork();
        if (!netCheck.ok) {
          console.warn('[connectWallet] Network mismatch after connect:', netCheck);
          showStatus(
            `> ⚠ NETWORK_MISMATCH: Petra is on "${netCheck.network}" but CipherLayer requires "${netCheck.expected}". ` +
            `Switch network in Petra settings.`, 'error'
          );
          // Still connected — don't disconnect, just warn
        }
      } catch (netErr) {
        console.warn('[connectWallet] Network check error (non-fatal):', netErr.message);
      }

    // ─── Petra requested but not installed — show clear instruction ──────────
    } else if (walletType === 'petra' && TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_PETRA && !AptosService.isPetraInstalled()) {
      console.warn('[connectWallet] Petra selected but NOT installed, falling back to mock');
      showStatus(
        '> ⚠ Petra wallet extension not detected. Install from https://petra.app then refresh. Using mock wallet for now.', 'error'
      );
      session = await WalletSession.connect(walletType);

    // ─── Mock / non-Petra path ───────────────────────────────────────────────
    } else {
      console.log('[connectWallet] Using MOCK connect for', walletType);
      session = await WalletSession.connect(walletType);
    }

    const isReal = session.isReal ? '[REAL]' : '[MOCK]';
    console.log('[connectWallet] Success:', isReal, 'address =', session.address?.slice(0, 10) + '...');

    AccessLog.add(ACTION_TYPES.WALLET_CONNECTED, {
      message: `${meta.name} wallet connected ${isReal}: ${WalletAdapters.shortenAddress(session.address)}`
    });
    renderWalletUI();
    document.getElementById('walletDropdown').classList.add('hidden');
    showStatus(`> ${meta.name} connected ${isReal}: ${WalletAdapters.shortenAddress(session.address)}`, 'info');

    // Auto-refresh balances after connect
    refreshBalances();
    setTimeout(hideStatus, 3000);
  } catch (e) {
    console.error('[connectWallet] FAILED:', e);
    const msg = e.message || 'Unknown wallet connection error';
    AccessLog.add(ACTION_TYPES.WALLET_CONNECTED, {
      message: `CONNECT_FAILED: ${meta.name} — ${msg}`
    });
    showStatus(`> CONNECT_FAILED: ${msg}`, 'error');
  }
}

async function doSignSession() {
  const session = WalletSession.getSession();
  if (!session) return;

  AccessLog.add(ACTION_TYPES.SIGNATURE_REQUESTED, {
    message: `Signature requested for ${WALLET_META[session.walletType].name} session`
  });

  showStatus('> Requesting signature...', 'info');

  try {
    let updated;
    // Use real Petra sign if real session
    if (session.isReal && session.walletType === 'petra' && AptosService.isPetraInstalled()) {
      const msg = `CipherLayer Session Auth\nTimestamp: ${Date.now()}\nWallet: ${session.address}`;
      const result = await AptosService.signMessagePetra(msg);
      updated = WalletSession.signSessionReal(result.signature);
    } else {
      updated = await WalletSession.signSession();
    }

    const isReal = updated.isReal ? '[REAL]' : '[MOCK]';
    AccessLog.add(ACTION_TYPES.SIGNATURE_ACCEPTED, {
      message: `Session signed ${isReal}: ${WALLET_META[session.walletType].name} → AUTHORIZED`
    });
    renderWalletUI();
    renderWalletSessionInfo();
    showStatus(`> Session signed ${isReal}. Status: AUTHORIZED.`, 'info');
    setTimeout(hideStatus, 3000);
  } catch (e) {
    AccessLog.add(ACTION_TYPES.SIGNATURE_REJECTED, {
      message: `Signature rejected by ${WALLET_META[session.walletType].name}`
    });
    showStatus('> SIGNATURE_REJECTED: User declined the signing request.', 'error');
    setTimeout(hideStatus, 4000);
  }
}

async function disconnectWallet() {
  const session = WalletSession.getSession();
  const walletName = session ? WALLET_META[session.walletType].name : 'Unknown';

  // Disconnect real Petra if it was a real session
  if (session && session.isReal && session.walletType === 'petra') {
    await AptosService.disconnectPetra();
  }

  WalletSession.disconnect();
  cachedAptBalance = null;
  cachedShelbyBalance = null;
  AccessLog.add(ACTION_TYPES.WALLET_DISCONNECTED, {
    message: `${walletName} wallet disconnected`
  });
  renderWalletUI();
  renderBalanceUI();
  document.getElementById('walletDropdown').classList.add('hidden');
  showStatus(`> ${walletName} disconnected.`, 'info');
  setTimeout(hideStatus, 2000);
}

function copyWalletAddress() {
  const addr = WalletSession.getAddress();
  if (!addr) return;
  navigator.clipboard.writeText(addr).then(() => {
    AccessLog.add(ACTION_TYPES.WALLET_ADDRESS_COPIED, {
      message: `Wallet address copied: ${WalletAdapters.shortenAddress(addr)}`
    });
    showStatus('> Wallet address copied.', 'info');
    setTimeout(hideStatus, 2000);
  });
  document.getElementById('walletDropdown').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════════
// INBOX / SHARED WITH ME
// ═══════════════════════════════════════════════════════════════════════════════

function renderInbox() {
  const list = document.getElementById('inboxList');
  const hint = document.getElementById('inboxHint');
  const countEl = document.getElementById('inboxCount');

  const currentAddr = WalletSession.getAddress();

  if (!currentAddr) {
    hint.classList.remove('hidden');
    hint.innerHTML = '<p class="empty-state">> CONNECT WALLET TO LOAD INBOUND RELAYS_</p>';
    list.innerHTML = '';
    countEl.textContent = '';
    return;
  }

  // Find all wallet-gated records addressed to current wallet
  const allRecords = VaultHistory.getAll();
  const inboxRecords = allRecords.filter(r =>
    r.accessMode === 'wallet-gated' &&
    r.recipientWallet === currentAddr
  );

  if (inboxRecords.length === 0) {
    hint.classList.remove('hidden');
    hint.innerHTML = '<p class="empty-state">> NO INBOUND RELAYS FOR THIS WALLET_</p>';
    list.innerHTML = '';
    countEl.textContent = '';
    return;
  }

  hint.classList.add('hidden');
  countEl.textContent = `[${inboxRecords.length} RELAYS]`;

  list.innerHTML = inboxRecords.map(r => {
    const expired = ExpirationUtil.isExpired(r);
    const expiryLabel = ExpirationUtil.getExpiryLabel(r);
    const isRevoked = r.status === 'revoked';
    const isConsumed = r.status === 'consumed' || (r.expiration === 'one-download' && r.downloadCount >= 1);
    const isInactive = isRevoked || isConsumed || expired;
    
    let statusClass, statusLabel;
    if (isRevoked) { statusClass = 'revoked'; statusLabel = 'REVOKED'; }
    else if (isConsumed) { statusClass = 'consumed'; statusLabel = 'CONSUMED'; }
    else if (expired) { statusClass = 'expired'; statusLabel = 'EXPIRED'; }
    else { statusClass = 'active'; statusLabel = 'ACTIVE'; }

    const sender = r.createdByWallet ? WalletAdapters.shortenAddress(r.createdByWallet) : 'ANONYMOUS';

    let inboxExplorerHtml = '';
    if (r.blobId) {
      const url = ShelbyService.getExplorerBlobUrl(r.blobId, r.fileName);
      inboxExplorerHtml = `<a class="history-action-btn explorer-btn" href="${url}" target="_blank" rel="noopener noreferrer">Explorer</a>`;
    }

    return `
      <div class="history-item ${isInactive ? 'expired' : ''}">
        <div class="history-item-header">
          <span class="history-item-name" title="${escapeHtml(r.fileName)}">${escapeHtml(r.fileName)}</span>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="history-item-meta">
          <span>From: ${sender}</span>
          <span>${formatSize(r.fileSize)}</span>
          <span>${new Date(r.createdAt).toLocaleDateString()}</span>
          <span>${expiryLabel}</span>
          <span>Wallet-Gated</span>
        </div>
        <div class="history-item-actions">
          <button class="history-action-btn" onclick="openInboxItem('${r.fileId}')">Open and Download</button>
          <button class="history-action-btn" onclick="copyValue('${r.fileId}')">Copy ID</button>
          ${inboxExplorerHtml}
        </div>
      </div>
    `;
  }).join('');
}

function openInboxItem(fileId) {
  switchTab('download');
  document.getElementById('downloadFileId').value = fileId;
  showStatus('> Inbound relay loaded. Enter decrypt key to access.', 'info');
}

// ─── Vault Search & Filter ──────────────────────────────────────────────────
const vaultSearchInput = document.getElementById('vaultSearch');
vaultSearchInput.addEventListener('input', () => renderHistory());

function setVaultFilter(filter, btn) {
  currentVaultFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

// ─── Vault Statistics ────────────────────────────────────────────────────────
function renderVaultStats() {
  const stats = VaultStats.compute();
  const grid = document.getElementById('statsGrid');
  
  grid.innerHTML = `
    <div class="stat-item">
      <span class="stat-value">${stats.total}</span>
      <span class="stat-label">TOTAL</span>
    </div>
    <div class="stat-item stat-active">
      <span class="stat-value">${stats.active}</span>
      <span class="stat-label">ACTIVE</span>
    </div>
    <div class="stat-item stat-expired">
      <span class="stat-value">${stats.expired}</span>
      <span class="stat-label">EXPIRED</span>
    </div>
    <div class="stat-item stat-consumed">
      <span class="stat-value">${stats.consumed}</span>
      <span class="stat-label">CONSUMED</span>
    </div>
    <div class="stat-item stat-revoked">
      <span class="stat-value">${stats.revoked}</span>
      <span class="stat-label">REVOKED</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">${stats.totalDownloads}</span>
      <span class="stat-label">DOWNLOADS</span>
    </div>
  `;
}

// ─── History / Vault Records ─────────────────────────────────────────────────
function renderHistory() {
  const list = document.getElementById('historyList');
  const count = document.getElementById('historyCount');
  const allRecords = VaultHistory.getAll();

  const query = vaultSearchInput ? vaultSearchInput.value : '';
  const sortEl = document.getElementById('vaultSort');
  const sort = sortEl ? sortEl.value : 'newest';

  const records = VaultFilter.apply(allRecords, {
    query,
    statusFilter: currentVaultFilter,
    sort
  });

  if (records.length === 0) {
    list.innerHTML = '<p class="empty-state">> NO RECORDS FOUND_</p>';
    count.textContent = allRecords.length > 0 ? `[${records.length}/${allRecords.length}]` : '';
    return;
  }

  count.textContent = `[${records.length}${records.length !== allRecords.length ? '/' + allRecords.length : ''} RECORDS]`;

  list.innerHTML = records.map(r => {
    const isRevoked = r.status === 'revoked';
    const isConsumed = r.status === 'consumed' || (r.expiration === 'one-download' && r.downloadCount >= 1);
    const expired = !isRevoked && !isConsumed && ExpirationUtil.isExpired(r);
    const expiryLabel = ExpirationUtil.getExpiryLabel(r);
    
    let statusClass, statusLabel;
    if (isRevoked) {
      statusClass = 'revoked';
      statusLabel = 'REVOKED';
    } else if (isConsumed) {
      statusClass = 'consumed';
      statusLabel = 'CONSUMED';
    } else if (expired) {
      statusClass = 'expired';
      statusLabel = 'EXPIRED';
    } else {
      statusClass = 'active';
      statusLabel = 'ACTIVE';
    }

    const isInactive = isRevoked || isConsumed || expired;

    const blobIdMeta = r.blobId
      ? `<span class="meta-tag" title="${r.blobId}">Blob: ${ShelbyService.truncateId(r.blobId, 6, 5)}</span>`
      : '';
    const txHashMeta = r.txHash
      ? `<span class="meta-tag" title="${r.txHash}">Tx: ${ShelbyService.truncateId(r.txHash, 6, 5)}</span>`
      : '';
    const providerMeta = r.provider
      ? `<span class="meta-tag">${r.provider}</span>`
      : '';

    const hashPreview = r.integrityHash 
      ? `<span>SHA-256: ${r.integrityHash.slice(0, 12)}...</span>` 
      : '';

    const accessModeLabel = r.accessMode
      ? `<span>${r.accessMode.charAt(0).toUpperCase() + r.accessMode.slice(1)}</span>`
      : '';

    const recipientLabel = r.recipientWallet
      ? `<span>To: ${WalletAdapters.shortenAddress(r.recipientWallet)}</span>`
      : '';

    const revokeBtn = !isInactive
      ? `<button class="history-action-btn warning-btn" onclick="revokeRecord('${r.fileId}')">Revoke</button>`
      : '';
    
    const copyBlobBtn = r.blobId
      ? `<button class="history-action-btn" onclick="copyValue('${r.blobId}')">Copy Blob ID</button>`
      : '';

    const copyHashBtn = r.integrityHash
      ? `<button class="history-action-btn" onclick="copyValue('${r.integrityHash}')">Copy Hash</button>`
      : '';

    let explorerBtnHtml = '';
    if (r.blobId) {
      const explorerUrl = ShelbyService.getExplorerBlobUrl(r.blobId, r.blobName || r.fileName);
      explorerBtnHtml = `<a class="history-action-btn explorer-btn" href="${explorerUrl}" target="_blank" rel="noopener noreferrer">Explorer</a>`;
    } else {
      const fallbackUrl = ShelbyService.getExplorerBaseUrl();
      explorerBtnHtml = `<a class="history-action-btn explorer-btn" href="${fallbackUrl}" target="_blank" rel="noopener noreferrer">Explorer</a>`;
    }

    return `
      <div class="history-item ${isInactive ? 'expired' : ''}">
        <div class="history-item-header">
          <span class="history-item-name" title="${escapeHtml(r.fileName)}">${escapeHtml(r.fileName)}</span>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="history-item-meta">
          <span>ID: ${r.fileId.slice(0, 16)}...</span>
          <span>SIZE: ${formatSize(r.fileSize)}</span>
          <span>CREATED: ${new Date(r.createdAt).toLocaleDateString()}</span>
          <span>EXPIRES: ${expiryLabel}</span>
          <span>DL: ${r.downloadCount || 0}</span>
          ${accessModeLabel}
          ${recipientLabel}
          ${hashPreview}
          ${blobIdMeta}
          ${txHashMeta}
          ${providerMeta}
        </div>
        <div class="history-item-actions">
          <button class="history-action-btn" onclick="copyValue('${r.fileId}')">Copy ID</button>
          <button class="history-action-btn" onclick="copyValue('${escapeHtml(r.shareLink)}')">Copy Link</button>
          ${copyBlobBtn}
          ${copyHashBtn}
          ${explorerBtnHtml}
          ${revokeBtn}
          <button class="history-action-btn danger" onclick="removeHistoryRecord('${r.fileId}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  renderVaultStats();
}

function revokeRecord(fileId) {
  const record = VaultHistory.getRecord(fileId);
  if (!record) return;
  if (record.status === 'revoked') {
    showStatus('> Link already revoked.', 'info');
    return;
  }
  VaultHistory.revokeLink(fileId);
  renderHistory();
  renderAccessLog();
  showStatus('> LINK_REVOKED: Share link has been invalidated.', 'info');
  setTimeout(hideStatus, 3000);
}

function removeHistoryRecord(fileId) {
  const record = VaultHistory.getRecord(fileId);
  VaultHistory.removeRecord(fileId);
  AccessLog.add(ACTION_TYPES.RECORD_REMOVED, {
    fileId,
    fileName: record ? record.fileName : fileId,
    message: `Record deleted: ${record ? record.fileName : fileId}`
  });
  renderHistory();
  renderAccessLog();
  showStatus('> Record removed.', 'info');
  setTimeout(hideStatus, 2000);
}

// ─── Access Log UI ───────────────────────────────────────────────────────────
function renderAccessLog() {
  const list = document.getElementById('accessLogList');
  const countEl = document.getElementById('logCount');
  const logs = AccessLog.getRecent(30);

  if (logs.length === 0) {
    list.innerHTML = '<p class="empty-state">> NO EVENTS LOGGED_</p>';
    countEl.textContent = '';
    return;
  }

  const total = AccessLog.getAll().length;
  countEl.textContent = `[${logs.length}/${total} EVENTS]`;

  list.innerHTML = logs.map(log => {
    const time = new Date(log.timestamp);
    const timeStr = time.toLocaleTimeString('en-US', { hour12: false });
    const dateStr = time.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
    const actionClass = getLogActionClass(log.action);
    
    return `
      <div class="log-entry">
        <span class="log-time">${dateStr} ${timeStr}</span>
        <span class="log-action ${actionClass}">${log.action}</span>
        <span class="log-message">${escapeHtml(log.message)}</span>
      </div>
    `;
  }).join('');
}

function getLogActionClass(action) {
  if (action.includes('FAILED') || action.includes('REVOKED') || action.includes('WIPED') || action.includes('REMOVED') || action.includes('EXPIRED') || action.includes('REJECTED') || action.includes('DENIED') || action.includes('DISCONNECTED')) return 'log-danger';
  if (action.includes('SUCCESS') || action.includes('VERIFIED') || action.includes('UPLOADED') || action.includes('ENCRYPTED') || action.includes('CONNECTED') || action.includes('ACCEPTED') || action.includes('AUTHORIZED') || action.includes('ALLOWED')) return 'log-success';
  if (action.includes('ATTEMPT') || action.includes('CREATED') || action.includes('COPIED') || action.includes('REQUESTED')) return 'log-info';
  return '';
}

// ─── Panic Wipe ──────────────────────────────────────────────────────────────
function initPanicWipe() {
  document.getElementById('panicModal').classList.remove('hidden');
}

function cancelPanicWipe() {
  document.getElementById('panicModal').classList.add('hidden');
}

function confirmPanicWipe() {
  PanicWipe.execute();
  document.getElementById('panicModal').classList.add('hidden');
  
  renderHistory();
  renderAccessLog();
  renderVaultStats();
  renderWalletUI();
  
  showStatus('> LOCAL_VAULT_PURGED — SESSION_STATE_WIPED — ALL DATA DESTROYED.', 'error');
  
  AccessLog.add(ACTION_TYPES.VAULT_WIPED, { message: 'PANIC WIPE: All local vault data purged' });
  renderAccessLog();
}

// ─── Copy helpers ─────────────────────────────────────────────────────────────
function copyTextContent(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    showStatus('> Copied to clipboard.', 'info');
    setTimeout(hideStatus, 2000);
  });
}

function copyValue(value) {
  navigator.clipboard.writeText(value).then(() => {
    showStatus('> Copied to clipboard.', 'info');
    setTimeout(hideStatus, 2000);
  });
}

function copyText(elementId) { copyTextContent(elementId); }

// ─── Status helpers ──────────────────────────────────────────────────────────
function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
}

function hideStatus() {
  document.getElementById('status').className = 'status hidden';
}

// ─── Periodic expiration check ───────────────────────────────────────────────
setInterval(() => {
  const records = VaultHistory.getAll();
  let changed = false;
  for (const r of records) {
    if (r.status === 'active' && ExpirationUtil.isExpired(r)) {
      VaultHistory.updateRecord(r.fileId, { status: 'expired' });
      localStorage.removeItem(r.fileId);
      AccessLog.add(ACTION_TYPES.RECORD_EXPIRED, {
        fileId: r.fileId,
        fileName: r.fileName,
        message: `Auto-expired: ${r.fileName}`
      });
      changed = true;
    }
  }
  if (changed && !document.getElementById('history-tab').classList.contains('hidden')) {
    renderHistory();
    renderAccessLog();
  }
}, 30000);

// ═══════════════════════════════════════════════════════════════════════════════
// TESTNET BALANCE & DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════════

async function refreshBalances() {
  const addr = WalletSession.getAddress();
  if (!addr) return;

  try {
    cachedAptBalance = await AptosService.getAptBalance(addr);
    AccessLog.add(ACTION_TYPES.APT_BALANCE_CHECKED, {
      message: `APT balance: ${cachedAptBalance.toFixed(4)} APT`
    });
  } catch {
    cachedAptBalance = AptosService.getMockAptBalance();
  }

  try {
    cachedShelbyBalance = await ShelbyService.getBalance(addr);
    AccessLog.add(ACTION_TYPES.SHELBY_BALANCE_CHECKED, {
      message: `ShelbyUSD balance: ${cachedShelbyBalance.toFixed(2)} ShelbyUSD`
    });
  } catch {
    cachedShelbyBalance = ShelbyService.getMockBalance();
  }

  lastBalanceCheck = Date.now();
  renderBalanceUI();
}

function renderBalanceUI() {
  const aptEl = document.getElementById('aptBalanceDisplay');
  const shelbyEl = document.getElementById('shelbyBalanceDisplay');
  const aptBadge = document.getElementById('aptStatusBadge');
  const shelbyBadge = document.getElementById('shelbyStatusBadge');
  if (!aptEl) return;

  if (cachedAptBalance !== null) {
    aptEl.textContent = cachedAptBalance.toFixed(4) + ' APT';
    const check = AptosService.checkAptSufficiency(cachedAptBalance);
    if (!TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_APTOS_BALANCE) {
      aptBadge.textContent = check.label === 'READY' ? 'MOCK' : check.label;
      aptBadge.className = 'balance-status ' + (check.ok ? 'mock' : check.label.toLowerCase());
    } else {
      aptBadge.textContent = check.label;
      aptBadge.className = 'balance-status ' + check.label.toLowerCase();
    }
  } else {
    aptEl.textContent = '--';
    aptBadge.textContent = '';
  }

  if (cachedShelbyBalance !== null) {
    shelbyEl.textContent = cachedShelbyBalance.toFixed(2) + ' ShelbyUSD';
    const check = ShelbyService.checkShelbySufficiency(cachedShelbyBalance);
    if (!ShelbyService.isRealBalance()) {
      shelbyBadge.textContent = check.ok ? 'MOCK' : check.label;
      shelbyBadge.className = 'balance-status ' + (check.ok ? 'mock' : check.label.toLowerCase());
    } else {
      shelbyBadge.textContent = check.label;
      shelbyBadge.className = 'balance-status ' + check.label.toLowerCase();
    }
  } else {
    shelbyEl.textContent = '--';
    shelbyBadge.textContent = '';
  }
}

function renderDiagnostics() {
  const grid = document.getElementById('diagnosticsGrid');
  if (!grid || !TESTNET_CONFIG.FEATURE_FLAGS.SHOW_DEV_PANEL) {
    if (grid) grid.parentElement.classList.add('hidden');
    return;
  }
  grid.parentElement.classList.remove('hidden');

  const session = WalletSession.getSession();
  const walletStatus = session ? session.status : 'DISCONNECTED';
  const walletMode = session?.isReal ? 'REAL' : (session ? 'MOCK' : 'N/A');
  const petraDetected = AptosService.isPetraInstalled() ? 'YES' : 'NO';
  const aptBalMode = TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_APTOS_BALANCE ? 'REAL' : 'MOCK';
  const shelbyBalMode = ShelbyService.isRealBalance() ? 'REAL' : 'MOCK';
  const uploadStatus = lastUploadStatus
    ? `${lastUploadStatus.status.toUpperCase()} (${new Date(lastUploadStatus.timestamp).toLocaleTimeString()})`
    : 'NONE';
  const uploadStatusClass = lastUploadStatus
    ? (lastUploadStatus.status === 'completed' ? 'real' : lastUploadStatus.status === 'failed' ? 'error' : 'mock')
    : 'disconnected';

  grid.innerHTML = `
    <div class="diag-item">
      <span class="diag-label">NETWORK</span>
      <span class="diag-value">${TESTNET_CONFIG.MODE.toUpperCase()}</span>
    </div>
    <div class="diag-item">
      <span class="diag-label">UPLOAD PROVIDER</span>
      <span class="diag-value ${ShelbyService.isRealProvider() ? 'real' : 'mock'}">${ShelbyService.getProviderLabel()}</span>
    </div>
    <div class="diag-item">
      <span class="diag-label">PETRA DETECTED</span>
      <span class="diag-value ${petraDetected === 'YES' ? 'real' : 'mock'}">${petraDetected}</span>
    </div>
    <div class="diag-item">
      <span class="diag-label">WALLET STATUS</span>
      <span class="diag-value ${walletStatus === 'AUTHORIZED' ? 'connected' : walletStatus === 'CONNECTED' ? 'mock' : 'disconnected'}">${walletStatus}</span>
    </div>
    <div class="diag-item">
      <span class="diag-label">WALLET MODE</span>
      <span class="diag-value ${walletMode === 'REAL' ? 'real' : 'mock'}">${walletMode}</span>
    </div>
    <div class="diag-item">
      <span class="diag-label">APT BALANCE</span>
      <span class="diag-value">${cachedAptBalance !== null ? cachedAptBalance.toFixed(4) : '--'} <small class="diag-mode">[${aptBalMode}]</small></span>
    </div>
    <div class="diag-item">
      <span class="diag-label">SHELBYUSD</span>
      <span class="diag-value ${shelbyBalMode === 'REAL' ? '' : 'mock'}">${cachedShelbyBalance !== null ? cachedShelbyBalance.toFixed(2) : '--'} <small class="diag-mode">[${shelbyBalMode}]</small></span>
    </div>
    <div class="diag-item">
      <span class="diag-label">BALANCE CHECK</span>
      <span class="diag-value">${lastBalanceCheck ? new Date(lastBalanceCheck).toLocaleTimeString() : 'NEVER'}</span>
    </div>
    <div class="diag-item">
      <span class="diag-label">LAST UPLOAD</span>
      <span class="diag-value ${uploadStatusClass}">${uploadStatus}</span>
    </div>
    <div class="diag-item">
      <span class="diag-label">REQUIRE WALLET</span>
      <span class="diag-value">${TESTNET_CONFIG.FEATURE_FLAGS.REQUIRE_WALLET_FOR_UPLOAD ? 'YES' : 'NO'}</span>
    </div>
    <div class="diag-item">
      <span class="diag-label">REQUIRE SIGN</span>
      <span class="diag-value">${TESTNET_CONFIG.FEATURE_FLAGS.REQUIRE_SESSION_SIGN ? 'YES' : 'NO'}</span>
    </div>
    <div class="diag-item">
      <span class="diag-label">REQUIRE BAL.</span>
      <span class="diag-value">${TESTNET_CONFIG.FEATURE_FLAGS.REQUIRE_BALANCE_CHECK ? 'YES' : 'NO'}</span>
    </div>
  `;
}

function renderUploadReadiness() {
  const el = document.getElementById('uploadReadiness');
  if (!el) return;

  const session = WalletSession.getSession();
  const items = [];

  // Wallet status
  if (session) {
    items.push({ icon: 'ok', label: 'WALLET', value: `${WALLET_META[session.walletType].name} ${session.isReal ? '[REAL]' : '[MOCK]'}` });
  } else {
    items.push({ icon: TESTNET_CONFIG.FEATURE_FLAGS.REQUIRE_WALLET_FOR_UPLOAD ? 'fail' : 'warn', label: 'WALLET', value: 'NOT CONNECTED' });
  }

  // Session status
  if (session && (session.status === 'AUTHORIZED' || session.status === 'SIGNED')) {
    items.push({ icon: 'ok', label: 'SESSION', value: session.status });
  } else if (session) {
    items.push({ icon: TESTNET_CONFIG.FEATURE_FLAGS.REQUIRE_SESSION_SIGN ? 'fail' : 'warn', label: 'SESSION', value: 'NOT SIGNED' });
  }

  // APT balance
  if (cachedAptBalance !== null) {
    const check = AptosService.checkAptSufficiency(cachedAptBalance);
    items.push({ icon: check.ok ? 'ok' : 'fail', label: 'APT', value: `${cachedAptBalance.toFixed(4)} [${check.label}]` });
  }

  // ShelbyUSD balance
  if (cachedShelbyBalance !== null) {
    const check = ShelbyService.checkShelbySufficiency(cachedShelbyBalance);
    items.push({ icon: check.ok ? 'ok' : 'fail', label: 'ShelbyUSD', value: `${cachedShelbyBalance.toFixed(2)} [MOCK]` });
  }

  // Upload provider
  items.push({ icon: TESTNET_CONFIG.FEATURE_FLAGS.USE_REAL_SHELBY ? 'ok' : 'warn', label: 'UPLOAD', value: ShelbyService.getProviderLabel() });

  if (items.length === 0) {
    el.classList.add('hidden');
    return;
  }

  el.classList.remove('hidden');
  el.innerHTML = items.map(i => `
    <div class="readiness-item">
      <span class="readiness-icon ${i.icon}">${i.icon === 'ok' ? '✓' : i.icon === 'warn' ? '⚠' : '✗'}</span>
      <span class="readiness-label">${i.label}:</span>
      <span class="readiness-value">${i.value}</span>
    </div>
  `).join('');
}
