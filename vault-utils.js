// ═══════════════════════════════════════════════════════════════════════════════
// vault-utils.js — Utility modules for CipherLayer
// Features: history, expiration, links, passphrase, access log, integrity,
//           statistics, panic wipe, search/filter
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Brand Constants ─────────────────────────────────────────────────────────
const BRAND = Object.freeze({
  NAME: 'CipherLayer',
  TAGLINE: 'Secure Encrypted File Relay',
  PROTOCOL: 'CIPHERLAYER SECURE PROTOCOL v2.0',
  SUBTITLE: 'CLIENT-SIDE ENCRYPTED FILE RELAY',
  FILE_PREFIX: 'cipher_',
  STORAGE_KEY: 'cipherlayer_vault_history',
  LOG_STORAGE_KEY: 'cipherlayer_access_log',
  FOOTER: 'SECURED BY CIPHERLAYER | AES-256-GCM | CLIENT-SIDE ONLY'
});

// ─── Action Types ────────────────────────────────────────────────────────────
const ACTION_TYPES = Object.freeze({
  FILE_ENCRYPTED: 'FILE_ENCRYPTED',
  FILE_UPLOADED: 'FILE_UPLOADED',
  LINK_CREATED: 'LINK_CREATED',
  LINK_COPIED: 'LINK_COPIED',
  DOWNLOAD_ATTEMPT: 'DOWNLOAD_ATTEMPT',
  DOWNLOAD_SUCCESS: 'DOWNLOAD_SUCCESS',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  LINK_REVOKED: 'LINK_REVOKED',
  RECORD_REMOVED: 'RECORD_REMOVED',
  RECORD_EXPIRED: 'RECORD_EXPIRED',
  INTEGRITY_VERIFIED: 'INTEGRITY_VERIFIED',
  VAULT_WIPED: 'VAULT_WIPED',
  PASSPHRASE_GEN: 'PASSPHRASE_GEN',
  PASSPHRASE_COPIED: 'PASSPHRASE_COPIED',
  WALLET_CONNECTED: 'WALLET_CONNECTED',
  WALLET_DISCONNECTED: 'WALLET_DISCONNECTED',
  SIGNATURE_REQUESTED: 'SIGNATURE_REQUESTED',
  SIGNATURE_ACCEPTED: 'SIGNATURE_ACCEPTED',
  SIGNATURE_REJECTED: 'SIGNATURE_REJECTED',
  WALLET_ADDRESS_COPIED: 'WALLET_ADDRESS_COPIED',
  WALLET_GATED_DENIED: 'WALLET_GATED_DENIED',
  WALLET_GATED_ALLOWED: 'WALLET_GATED_ALLOWED',
  // Testnet events
  TESTNET_MODE_ENABLED: 'TESTNET_MODE_ENABLED',
  APT_BALANCE_CHECKED: 'APT_BALANCE_CHECKED',
  SHELBY_BALANCE_CHECKED: 'SHELBY_BALANCE_CHECKED',
  MISSING_APT_TESTNET: 'MISSING_APT_TESTNET',
  MISSING_SHELBY_USD: 'MISSING_SHELBY_USD',
  SHELBY_UPLOAD_STARTED: 'SHELBY_UPLOAD_STARTED',
  SHELBY_UPLOAD_COMPLETED: 'SHELBY_UPLOAD_COMPLETED',
  SHELBY_UPLOAD_FAILED: 'SHELBY_UPLOAD_FAILED',
  RECORD_PERSISTED: 'RECORD_PERSISTED'
});

// ─── Passphrase Utilities ────────────────────────────────────────────────────
const PassphraseUtil = (() => {
  const WORD_LIST = [
    'alpha', 'bravo', 'cipher', 'delta', 'echo', 'foxtrot', 'gamma', 'hotel',
    'india', 'juliet', 'kilo', 'lima', 'mike', 'nova', 'oscar', 'papa',
    'quebec', 'romeo', 'sierra', 'tango', 'ultra', 'victor', 'whiskey', 'xray',
    'yankee', 'zulu', 'aegis', 'blade', 'crypt', 'drift', 'ember', 'flux',
    'ghost', 'haze', 'ionic', 'jetex', 'knot', 'lynx', 'mesa', 'nexus',
    'orbit', 'pulse', 'quasar', 'reign', 'shade', 'titan', 'umbra', 'vortex'
  ];

  function generate(wordCount = 5) {
    const words = [];
    const arr = crypto.getRandomValues(new Uint8Array(wordCount));
    for (let i = 0; i < wordCount; i++) {
      words.push(WORD_LIST[arr[i] % WORD_LIST.length]);
    }
    const num = crypto.getRandomValues(new Uint8Array(1))[0] % 100;
    return words.join('-') + '-' + String(num).padStart(2, '0');
  }

  function getStrength(passphrase) {
    if (!passphrase) return { level: 'none', score: 0, label: 'EMPTY', color: '#555' };
    const len = passphrase.length;
    const hasUpper = /[A-Z]/.test(passphrase);
    const hasLower = /[a-z]/.test(passphrase);
    const hasDigit = /[0-9]/.test(passphrase);
    const hasSpecial = /[^A-Za-z0-9]/.test(passphrase);

    let score = 0;
    if (len >= 8) score++;
    if (len >= 12) score++;
    if (len >= 20) score++;
    if (len >= 30) score++;
    if (hasUpper) score++;
    if (hasLower) score++;
    if (hasDigit) score++;
    if (hasSpecial) score++;

    if (score <= 2) return { level: 'weak', score: 1, label: 'WEAK — consider a stronger passphrase', color: '#ff4444' };
    if (score <= 4) return { level: 'medium', score: 2, label: 'MEDIUM', color: '#ffcc00' };
    return { level: 'strong', score: 3, label: 'STRONG', color: '#ff4fa3' };
  }

  return { generate, getStrength };
})();

// ─── Expiration Logic ────────────────────────────────────────────────────────
const ExpirationUtil = (() => {
  const OPTIONS = [
    { value: 'never', label: 'NEVER' },
    { value: '1h', label: '1 HOUR' },
    { value: '1d', label: '1 DAY' },
    { value: '7d', label: '7 DAYS' },
    { value: 'one-download', label: 'ONE DOWNLOAD' }
  ];

  function getExpiryTimestamp(option) {
    const now = Date.now();
    switch (option) {
      case '1h': return now + 3600 * 1000;
      case '1d': return now + 86400 * 1000;
      case '7d': return now + 7 * 86400 * 1000;
      case 'one-download': return null;
      case 'never': default: return null;
    }
  }

  function isExpired(record) {
    if (!record) return true;
    if (record.status === 'revoked') return true;
    if (record.expiration === 'one-download' && record.downloadCount >= 1) return true;
    if (record.expiresAt && Date.now() > record.expiresAt) return true;
    return false;
  }

  function getExpiryLabel(record) {
    if (!record) return 'UNKNOWN';
    if (record.status === 'revoked') return 'REVOKED';
    if (record.expiration === 'never') return 'NEVER';
    if (record.expiration === 'one-download') {
      return record.downloadCount >= 1 ? 'CONSUMED' : 'ONE DOWNLOAD';
    }
    if (record.expiresAt) {
      if (Date.now() > record.expiresAt) return 'EXPIRED';
      const remaining = record.expiresAt - Date.now();
      if (remaining < 3600000) return Math.ceil(remaining / 60000) + ' MIN LEFT';
      if (remaining < 86400000) return Math.ceil(remaining / 3600000) + ' HR LEFT';
      return Math.ceil(remaining / 86400000) + ' DAYS LEFT';
    }
    return 'NEVER';
  }

  return { OPTIONS, getExpiryTimestamp, isExpired, getExpiryLabel };
})();

// ─── Integrity Hash (SHA-256) ────────────────────────────────────────────────
const IntegrityUtil = (() => {
  async function computeHash(arrayBuffer) {
    const hash = await crypto.subtle.digest('SHA-256', arrayBuffer);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function verifyHash(arrayBuffer, expectedHash) {
    const actual = await computeHash(arrayBuffer);
    return { match: actual === expectedHash, actual, expected: expectedHash };
  }

  return { computeHash, verifyHash };
})();

// ─── Access Log ──────────────────────────────────────────────────────────────
const AccessLog = (() => {
  const MAX_ENTRIES = 200;

  function getAll() {
    try {
      const data = localStorage.getItem(BRAND.LOG_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  function save(logs) {
    localStorage.setItem(BRAND.LOG_STORAGE_KEY, JSON.stringify(logs));
  }

  function add(action, detail = {}) {
    const logs = getAll();
    logs.unshift({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      action,
      fileId: detail.fileId || null,
      fileName: detail.fileName || null,
      message: detail.message || action.replace(/_/g, ' ')
    });
    // Keep only last MAX_ENTRIES
    if (logs.length > MAX_ENTRIES) logs.length = MAX_ENTRIES;
    save(logs);
    return logs;
  }

  function clear() {
    localStorage.removeItem(BRAND.LOG_STORAGE_KEY);
  }

  function getRecent(count = 20) {
    return getAll().slice(0, count);
  }

  return { getAll, add, clear, getRecent };
})();

// ─── History / Vault Records Persistence ─────────────────────────────────────
const VaultHistory = (() => {
  const STORAGE_KEY = BRAND.STORAGE_KEY;
  const LEGACY_STORAGE_KEY = 'shelby_vault_history';

  function getAll() {
    try {
      let data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        data = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (data) {
          localStorage.setItem(STORAGE_KEY, data);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  function save(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function addRecord(record) {
    const records = getAll();
    records.unshift(record);
    save(records);
    return records;
  }

  function removeRecord(fileId) {
    const records = getAll().filter(r => r.fileId !== fileId);
    save(records);
    localStorage.removeItem(fileId);
    return records;
  }

  function getRecord(fileId) {
    return getAll().find(r => r.fileId === fileId) || null;
  }

  function updateRecord(fileId, updates) {
    const records = getAll();
    const idx = records.findIndex(r => r.fileId === fileId);
    if (idx !== -1) {
      records[idx] = { ...records[idx], ...updates };
      save(records);
    }
    return records;
  }

  function incrementDownloadCount(fileId) {
    return updateRecord(fileId, {
      downloadCount: (getRecord(fileId)?.downloadCount || 0) + 1
    });
  }

  function revokeLink(fileId) {
    const record = getRecord(fileId);
    if (!record) return null;
    updateRecord(fileId, { status: 'revoked' });
    // Remove the encrypted data
    localStorage.removeItem(fileId);
    AccessLog.add(ACTION_TYPES.LINK_REVOKED, {
      fileId,
      fileName: record.fileName,
      message: `Link revoked for ${record.fileName}`
    });
    return getRecord(fileId);
  }

  function clearAll() {
    const records = getAll();
    // Remove all encrypted file data
    for (const r of records) {
      localStorage.removeItem(r.fileId);
    }
    localStorage.removeItem(STORAGE_KEY);
  }

  return { getAll, addRecord, removeRecord, getRecord, updateRecord, incrementDownloadCount, revokeLink, clearAll };
})();

// ─── Vault Statistics ────────────────────────────────────────────────────────
const VaultStats = (() => {
  function compute() {
    const records = VaultHistory.getAll();
    let active = 0, expired = 0, consumed = 0, revoked = 0, totalDl = 0;

    for (const r of records) {
      if (r.status === 'revoked') {
        revoked++;
      } else if (r.status === 'consumed' || (r.expiration === 'one-download' && r.downloadCount >= 1)) {
        consumed++;
      } else if (ExpirationUtil.isExpired(r)) {
        expired++;
      } else {
        active++;
      }
      totalDl += (r.downloadCount || 0);
    }

    return {
      total: records.length,
      active,
      expired,
      consumed,
      revoked,
      totalDownloads: totalDl,
      logEntries: AccessLog.getAll().length
    };
  }

  return { compute };
})();

// ─── Vault Search & Filter ───────────────────────────────────────────────────
const VaultFilter = (() => {
  function apply(records, { query = '', statusFilter = 'all', sort = 'newest' } = {}) {
    let filtered = [...records];

    // Search by query
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(r =>
        (r.fileName && r.fileName.toLowerCase().includes(q)) ||
        (r.fileId && r.fileId.toLowerCase().includes(q)) ||
        (r.shareLink && r.shareLink.toLowerCase().includes(q))
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => {
        const isRevoked = r.status === 'revoked';
        const isConsumed = r.status === 'consumed' || (r.expiration === 'one-download' && r.downloadCount >= 1);
        const isExpired = !isRevoked && !isConsumed && ExpirationUtil.isExpired(r);
        const isActive = !isRevoked && !isConsumed && !isExpired;

        switch (statusFilter) {
          case 'active': return isActive;
          case 'expired': return isExpired;
          case 'consumed': return isConsumed;
          case 'revoked': return isRevoked;
          case 'one-download': return r.expiration === 'one-download';
          default: return true;
        }
      });
    }

    // Sort
    switch (sort) {
      case 'oldest':
        filtered.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case 'name':
        filtered.sort((a, b) => (a.fileName || '').localeCompare(b.fileName || ''));
        break;
      case 'newest':
      default:
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        break;
    }

    return filtered;
  }

  return { apply };
})();

// ─── Panic Wipe ──────────────────────────────────────────────────────────────
const PanicWipe = (() => {
  function execute() {
    // Clear vault records + their encrypted data
    VaultHistory.clearAll();
    // Clear access logs
    AccessLog.clear();
    // Clear wallet session
    if (typeof WalletSession !== 'undefined') {
      WalletSession.clearStorage();
    }
    // Clear mock testnet balances
    if (typeof AptosService !== 'undefined') {
      try { AptosService.setMockAptBalance(10.0); } catch { }
    }
    if (typeof ShelbyService !== 'undefined') {
      try { ShelbyService.setMockBalance(500.0); } catch { }
    }
    // Clear any other CipherLayer-related localStorage items
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(BRAND.FILE_PREFIX) || key.startsWith('shelby_') || key.startsWith('cipher_') || key.startsWith('cipherlayer_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    return true;
  }

  return { execute };
})();

// ─── Share Link Utilities ────────────────────────────────────────────────────
const ShareLinkUtil = (() => {
  function generateLink(fileId) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?file=${fileId}`;
  }

  function parseLink(input) {
    input = input.trim();
    if (input.startsWith(BRAND.FILE_PREFIX) || input.startsWith('shelby_')) return input;
    try {
      const url = new URL(input);
      const fileParam = url.searchParams.get('file');
      if (fileParam) return fileParam;
    } catch { }
    const pathMatch = input.match(/\/download\/([a-zA-Z0-9_]+)/);
    if (pathMatch) return pathMatch[1];
    return input;
  }

  return { generateLink, parseLink };
})();

// ─── File Queue Manager ──────────────────────────────────────────────────────
const FileQueue = (() => {
  let queue = [];
  let listeners = [];

  function onUpdate(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(fn => fn([...queue])); }

  function addFiles(fileList) {
    for (const file of fileList) {
      const exists = queue.some(q =>
        q.file.name === file.name &&
        q.file.size === file.size &&
        q.file.lastModified === file.lastModified
      );
      if (!exists) {
        queue.push({
          id: 'q_' + Math.random().toString(36).slice(2, 10),
          file,
          status: 'queued',
          progress: 0,
          encryptProgress: 0,
          uploadProgress: 0,
          error: null,
          result: null
        });
      }
    }
    notify();
  }

  function removeFile(queueId) {
    queue = queue.filter(q => q.id !== queueId);
    notify();
  }

  function updateItem(queueId, updates) {
    const item = queue.find(q => q.id === queueId);
    if (item) Object.assign(item, updates);
    notify();
  }

  function getQueue() { return [...queue]; }

  function clear() {
    queue = [];
    notify();
  }

  function hasFiles() { return queue.length > 0; }

  return { addFiles, removeFile, updateItem, getQueue, clear, hasFiles, onUpdate };
})();
