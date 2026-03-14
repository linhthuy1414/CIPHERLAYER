# CipherLayer — Manual QA Scenarios

> Comprehensive test flows for all CipherLayer features.  
> Each test is designed to be executed manually in the browser.  
> All tests assume a fresh browser session unless stated otherwise.

---

## Prerequisites

- Open `index.html` in a modern browser (Chrome/Firefox/Edge recommended)
- Or serve via `python -m http.server 8080` → `http://localhost:8080`
- DevTools Console open (optional, for debugging)
- Before each section: consider running **Panic Wipe** for a clean slate

---

## A. Upload / Encryption

### A1. Upload a single file
- **Goal:** Verify basic upload flow works end-to-end
- **Preconditions:** Upload tab active, no files in queue
- **Steps:**
  1. Click the drop zone or "SELECT_FILES" button
  2. Select one file (e.g. a small .txt or .png)
  3. Leave expiration as NEVER, access mode as PASSPHRASE
  4. Click [GEN] to generate a passphrase
  5. Click ENCRYPT_AND_UPLOAD
- **Expected:**
  - File queue shows with ENCRYPTING progress → UPLOADING progress → COMPLETED
  - Upload result card appears with: FILE_ID, SHARE_LINK, DECRYPT_KEY, SHA-256, ACCESS_MODE, FILE_SIZE, UPLOAD_TIME, EXPIRATION
  - Passphrase field shows the generated key
  - Warning message: "SAVE DECRYPT_KEY. RECOVERY IS IMPOSSIBLE."
- **Events logged:** `FILE_ENCRYPTED`, `FILE_UPLOADED`, `LINK_CREATED`, `PASSPHRASE_GEN`

---

### A2. Upload multiple files at once
- **Goal:** Verify multi-file queue processing
- **Preconditions:** Upload tab active, queue empty
- **Steps:**
  1. Drag & drop 3 files onto the drop zone
  2. Verify all 3 appear in FILE_QUEUE with status QUEUED
  3. Click ENCRYPT_AND_UPLOAD
- **Expected:**
  - Files process sequentially (one ENCRYPTING → UPLOADING at a time)
  - Each file gets its own result card
  - All 3 show status COMPLETED in the queue
  - All share the same DECRYPT_KEY (one passphrase for the batch)
- **Events logged:** 3× `FILE_ENCRYPTED`, 3× `FILE_UPLOADED`, 3× `LINK_CREATED`

---

### A3. Remove a file from queue before upload
- **Goal:** Verify queue item removal
- **Preconditions:** Upload tab active
- **Steps:**
  1. Select 3 files
  2. Click [✕] on the middle file in the queue
  3. Verify only 2 files remain
  4. Click [CLEAR ALL]
  5. Verify queue is empty and container is hidden
- **Expected:**
  - Removing a file updates the queue immediately
  - CLEAR ALL empties the entire queue
  - Upload results area also clears on CLEAR ALL

---

### A4. Generate and copy passphrase
- **Goal:** Verify passphrase tools
- **Preconditions:** Upload tab active
- **Steps:**
  1. Click [GEN] — passphrase appears in the input field (visible text)
  2. Verify format: `word-word-word-word-word-NN` (5 words + 2-digit number)
  3. Verify strength indicator shows STRONG (bar at 100%, pink color)
  4. Click [CPY] — should copy to clipboard
  5. Paste somewhere to verify clipboard content matches
  6. Click [👁] to toggle visibility (should switch to [🔒])
- **Expected:**
  - Generated passphrase is a 5-word diceware-style phrase
  - Strength bar updates in real-time
  - Copy works (status message: "> Passphrase copied to clipboard.")
  - Visibility toggle works
- **Events logged:** `PASSPHRASE_GEN`, `PASSPHRASE_COPIED`

---

### A5. Upload with different expiration policies
- **Goal:** Verify all 5 expiration options create correct records
- **Preconditions:** Upload tab active, clean vault
- **Steps:**
  1. Upload file with NEVER → check vault record shows `EXPIRES: NEVER`
  2. Upload file with 1 HOUR → check vault record shows `EXPIRES: 60 MIN LEFT` (approximately)
  3. Upload file with 1 DAY → check vault record shows `EXPIRES: 1 DAYS LEFT`
  4. Upload file with 7 DAYS → check vault record shows `EXPIRES: 7 DAYS LEFT`
  5. Upload file with ONE DL → check vault record shows `EXPIRES: ONE DOWNLOAD`
- **Expected:**
  - Each record in Vault tab has correct expiration label
  - Statistics panel on Vault tab shows all 5 as ACTIVE

---

### A6. Upload without entering passphrase (auto-generate)
- **Goal:** Verify auto-generated key flow
- **Preconditions:** Upload tab active, passphrase field empty
- **Steps:**
  1. Select a file
  2. Leave passphrase field EMPTY
  3. Click ENCRYPT_AND_UPLOAD
- **Expected:**
  - A 32-character random key auto-fills in the passphrase field
  - Field switches to visible text
  - Strength indicator updates
  - Result card shows the auto-generated DECRYPT_KEY

---

## B. Download / Access

### B1. Download by File ID
- **Goal:** Verify download with direct file ID
- **Preconditions:** Upload a file first, save the FILE_ID and DECRYPT_KEY
- **Steps:**
  1. Switch to Download tab
  2. Paste the FILE_ID (e.g. `cipher_abc123def456...`)
  3. Paste the DECRYPT_KEY
  4. Click DECRYPT_AND_DOWNLOAD
- **Expected:**
  - Status: "> Connecting to CipherLayer relay..." → "> Decrypting payload..."
  - DECRYPTION_SUCCESS card appears
  - Integrity badge: "> INTEGRITY_VERIFIED ✓ (SHA-256)"
  - SHA-256 hash shown
  - SAVE_FILE button available
  - Clicking SAVE_FILE downloads the original file
- **Events logged:** `DOWNLOAD_ATTEMPT`, `DOWNLOAD_SUCCESS`, `INTEGRITY_VERIFIED`

---

### B2. Download by share link
- **Goal:** Verify share link parsing
- **Preconditions:** Upload a file first, save the SHARE_LINK and DECRYPT_KEY
- **Steps:**
  1. Switch to Download tab
  2. Paste the full SHARE_LINK (e.g. `http://localhost:8080/?file=cipher_abc123...`)
  3. Paste the DECRYPT_KEY
  4. Click DECRYPT_AND_DOWNLOAD
- **Expected:**
  - App parses the `?file=` parameter from the URL
  - Download succeeds same as B1
- **Events logged:** `DOWNLOAD_ATTEMPT`, `DOWNLOAD_SUCCESS`, `INTEGRITY_VERIFIED`

---

### B3. Download with wrong passphrase
- **Goal:** Verify decryption failure handling
- **Preconditions:** Upload a file first, save the FILE_ID
- **Steps:**
  1. Switch to Download tab
  2. Paste the correct FILE_ID
  3. Enter a WRONG passphrase (e.g. "wrong-key-12345")
  4. Click DECRYPT_AND_DOWNLOAD
- **Expected:**
  - Error card: "> DOWNLOAD_FAILED"
  - Message: "DECRYPT_FAILED: Wrong key or corrupted file. Verify your credentials."
- **Events logged:** `DOWNLOAD_ATTEMPT`, `DOWNLOAD_FAILED`

---

### B4. Download with non-existent file ID
- **Goal:** Verify missing file handling
- **Preconditions:** None
- **Steps:**
  1. Switch to Download tab
  2. Enter fake ID: `cipher_doesnotexist12345`
  3. Enter any passphrase
  4. Click DECRYPT_AND_DOWNLOAD
- **Expected:**
  - Error card: "> DOWNLOAD_FAILED"
  - Message: "DECRYPT_FAILED: Wrong key or corrupted file. Verify your credentials."
  - (Note: the error message is generic because the `cipherDownload` throws before decryption)
- **Events logged:** `DOWNLOAD_ATTEMPT`, `DOWNLOAD_FAILED`

---

### B5. Download a revoked link
- **Goal:** Verify revoked link blocking
- **Preconditions:** Upload a file, then go to Vault tab and click [REVOKE] on that record
- **Steps:**
  1. Copy the FILE_ID of the revoked record
  2. Switch to Download tab
  3. Paste the FILE_ID and correct DECRYPT_KEY
  4. Click DECRYPT_AND_DOWNLOAD
- **Expected:**
  - Error card: "> DOWNLOAD_FAILED"
  - Message: "LINK_REVOKED: This share link has been revoked by the owner."
  - Download is blocked BEFORE attempting decryption
- **Events logged:** `DOWNLOAD_FAILED` with message "Download blocked: link revoked"

---

### B6. Download an expired file (time-based)
- **Goal:** Verify time-based expiration blocks download
- **Preconditions:** Upload a file with 1 HOUR expiration, then either:
  - Wait for expiration (impractical), OR
  - Manually edit localStorage to set `expiresAt` to a past timestamp
- **Steps:**
  1. In DevTools Console: find the record and update `expiresAt` to `Date.now() - 1000`
  2. Try to download the file
- **Expected:**
  - Error: "FILE_EXPIRED: This file has passed its expiration time."
- **Events logged:** `DOWNLOAD_FAILED` with message "Download blocked: file expired"

---

### B7. ONE DOWNLOAD — download once then try again
- **Goal:** Verify one-download self-destruct
- **Preconditions:** Upload a file with ONE DL expiration
- **Steps:**
  1. Copy FILE_ID and DECRYPT_KEY
  2. Switch to Download tab
  3. Download successfully (first time)
  4. Verify in Vault tab: record status changed to CONSUMED
  5. Try to download the same FILE_ID again
- **Expected:**
  - First download: success, file saved
  - Vault record: status → CONSUMED, download count → 1
  - Second download: error "FILE_CONSUMED: This file was set to self-destruct after one download."
- **Events logged:** 
  - 1st: `DOWNLOAD_ATTEMPT`, `DOWNLOAD_SUCCESS`, `INTEGRITY_VERIFIED`
  - 2nd: `DOWNLOAD_FAILED`

---

### B8. Empty input validation
- **Goal:** Verify form validation
- **Steps:**
  1. Download tab → leave both fields empty → click DECRYPT_AND_DOWNLOAD
  2. Download tab → enter FILE_ID only, leave key empty → click
  3. Download tab → leave FILE_ID empty, enter key only → click
- **Expected:**
  - All cases: status message "> Please enter File ID / share link and decryption key."

---

## C. Vault / Records

### C1. Search records by file name
- **Goal:** Verify text search in vault
- **Preconditions:** Upload 3 files with distinct names (e.g. "alpha.txt", "beta.pdf", "gamma.png")
- **Steps:**
  1. Go to Vault tab
  2. Type "alpha" in the search box
- **Expected:**
  - Only "alpha.txt" record is shown
  - Counter shows `[1/3]`

---

### C2. Search records by file ID
- **Preconditions:** Upload a file, note the FILE_ID
- **Steps:**
  1. Go to Vault tab
  2. Paste part of the file ID (e.g. first 10 characters)
- **Expected:**
  - Matching record is shown

---

### C3. Filter by status
- **Preconditions:** Create records in different states:
  - Upload 1 file normally (ACTIVE)
  - Upload 1 file with ONE DL then download it (CONSUMED)
  - Upload 1 file and then REVOKE it (REVOKED)
- **Steps:**
  1. Click ALL → see all 3
  2. Click ACTIVE → see only active record
  3. Click CONSUMED → see only consumed record
  4. Click REVOKED → see only revoked record
- **Expected:**
  - Filters work correctly
  - Counter updates (e.g. `[1/3]`)

---

### C4. Sort records
- **Preconditions:** Upload 3 files with distinct names at different times
- **Steps:**
  1. Select NEWEST → most recent first
  2. Select OLDEST → oldest first
  3. Select NAME → alphabetical
- **Expected:**
  - Record order changes correctly per sort option

---

### C5. Copy actions
- **Steps:**
  1. Click [COPY ID] → clipboard should contain the file ID
  2. Click [COPY LINK] → clipboard should contain the share link
  3. Click [COPY HASH] → clipboard should contain the SHA-256 hash
- **Expected:**
  - Status message: "> Copied to clipboard." after each action

---

### C6. Revoke a link
- **Preconditions:** Upload a file (ACTIVE status)
- **Steps:**
  1. Go to Vault tab
  2. Click [REVOKE] on the active record
  3. Verify:
     - Status badge changes to REVOKED
     - [REVOKE] button disappears
     - Statistics update (REVOKED count +1, ACTIVE -1)
     - Status message: "> LINK_REVOKED: Share link has been invalidated."
  4. Try to download the file → should fail with LINK_REVOKED error
- **Events logged:** `LINK_REVOKED`

---

### C7. Delete a record
- **Preconditions:** Have at least 1 record in vault
- **Steps:**
  1. Click [DELETE] on a record
  2. Verify record disappears from vault
  3. Verify statistics update
- **Events logged:** `RECORD_REMOVED`

---

### C8. Panic Wipe — purge all local data
- **Goal:** Verify complete data destruction
- **Preconditions:** Have vault records, protocol events, and a connected wallet
- **Steps:**
  1. Go to Vault tab
  2. Click "⚠ PANIC_WIPE — PURGE ALL LOCAL DATA"
  3. Verify confirmation modal appears listing everything to delete
  4. Click ABORT → modal closes, nothing deleted
  5. Click the panic button again → click CONFIRM_WIPE
- **Expected:**
  - All vault records: gone
  - All encrypted file data: gone
  - All protocol events: gone (except the new VAULT_WIPED event)
  - Wallet session: disconnected (top-right shows CONNECT_WALLET)
  - Statistics: all zeros
  - Status: "> LOCAL_VAULT_PURGED — SESSION_STATE_WIPED — ALL DATA DESTROYED."
- **Events logged:** `VAULT_WIPED` (only event remaining after wipe)

---

## D. Security / Integrity

### D1. SHA-256 hash is generated on upload
- **Goal:** Verify integrity hash creation
- **Steps:**
  1. Upload any file
  2. Check the result card → SHA-256 row should show `a1b2c3d4...` (truncated hash)
  3. Go to Vault tab → record should show `SHA-256: a1b2c3d4e5f6...`
- **Expected:**
  - Hash is 64-character hex string
  - Stored in the vault record's `integrityHash` field

---

### D2. SHA-256 verified on download
- **Goal:** Verify integrity check during download
- **Steps:**
  1. Upload a file
  2. Download it with correct key
- **Expected:**
  - Green badge: "> INTEGRITY_VERIFIED ✓ (SHA-256)"
  - Full hash shown below
- **Events logged:** `INTEGRITY_VERIFIED`

---

### D3. Protocol events are logged correctly
- **Goal:** Verify comprehensive event logging
- **Steps:**
  1. Generate passphrase → check log for PASSPHRASE_GEN
  2. Upload file → check logs for FILE_ENCRYPTED, FILE_UPLOADED, LINK_CREATED
  3. Copy link → check log for LINK_COPIED
  4. Download file → check logs for DOWNLOAD_ATTEMPT, DOWNLOAD_SUCCESS
  5. Revoke link → check log for LINK_REVOKED
- **Expected:**
  - Each event has: date, time, action type, descriptive message
  - Events color-coded: green (success), red (danger), blue (info)
  - Events persist after page reload

---

### D4. Protocol events persist across reloads
- **Steps:**
  1. Upload a file (generates events)
  2. Reload the page
  3. Go to Vault tab → Protocol Events
- **Expected:**
  - Previous events still visible
  - Counter shows correct total

---

## E. Wallet / Web3 Mock

### E1. Connect Petra wallet
- **Goal:** Verify Petra mock connection
- **Preconditions:** No wallet connected (top-right shows CONNECT_WALLET)
- **Steps:**
  1. Click CONNECT_WALLET button
  2. Dropdown appears with 3 options
  3. Click "🔷 Petra"
  4. Wait ~1 second
- **Expected:**
  - Top-right changes to: pink dot + "Petra" + shortened address (e.g. `0x71a3...8f2d`) + CONNECTED badge
  - Status message: "> Petra connected: 0x71a3...8f2d"
  - Dropdown auto-closes
- **Events logged:** `WALLET_CONNECTED`

---

### E2. Connect Phantom wallet
- **Steps:** Same as E1 but click "👻 Phantom"
- **Expected:**
  - Address format: 44-char base58-like (e.g. `7KGdNy...t3hN`)
  - Label shows "Phantom", chain shows "Solana" in session info

---

### E3. Connect Backpack wallet
- **Steps:** Same as E1 but click "🎒 Backpack"
- **Expected:**
  - Address format: 44-char base58-like
  - Label shows "Backpack", chain shows "Multi" in session info

---

### E4. Sign session — success
- **Goal:** Verify session signing flow
- **Preconditions:** Wallet connected (status: CONNECTED)
- **Steps:**
  1. Click the connected wallet button (top-right)
  2. Dropdown shows session info: WALLET, CHAIN, ADDRESS, STATUS: CONNECTED
  3. Click [SIGN SESSION]
  4. Wait ~1 second
- **Expected (85% chance — success):**
  - Status badge changes to AUTHORIZED (green)
  - [SIGN SESSION] button disappears from dropdown
  - SIGNED timestamp appears in session info
  - Status message: "> Session signed. Status: AUTHORIZED."
- **Events logged:** `SIGNATURE_REQUESTED`, `SIGNATURE_ACCEPTED`

---

### E5. Sign session — rejection
- **Goal:** Verify signature rejection handling
- **Note:** Mock has 15% random rejection. May need multiple attempts.
- **Preconditions:** Wallet connected (status: CONNECTED)
- **Steps:**
  1. Click connected wallet → [SIGN SESSION]
  2. If rejected:
- **Expected (15% chance):**
  - Status: "> SIGNATURE_REJECTED: User declined the signing request."
  - Badge stays CONNECTED (not AUTHORIZED)
  - [SIGN SESSION] button remains visible
- **Events logged:** `SIGNATURE_REQUESTED`, `SIGNATURE_REJECTED`

---

### E6. Disconnect wallet
- **Goal:** Verify clean disconnect
- **Preconditions:** Wallet connected
- **Steps:**
  1. Click connected wallet button
  2. Click [DISCONNECT]
- **Expected:**
  - Top-right reverts to CONNECT_WALLET button with grey dot
  - Dropdown closes
  - Status message: "> {WalletName} disconnected."
  - Wallet session removed from localStorage
- **Events logged:** `WALLET_DISCONNECTED`

---

### E7. Copy wallet address
- **Preconditions:** Wallet connected
- **Steps:**
  1. Click connected wallet → [COPY ADDRESS]
  2. Paste somewhere to verify
- **Expected:**
  - Full wallet address copied (not shortened)
  - Status: "> Wallet address copied."
  - Dropdown closes
- **Events logged:** `WALLET_ADDRESS_COPIED`

---

### E8. Wallet session persists across page reload
- **Preconditions:** Wallet connected (CONNECTED or AUTHORIZED)
- **Steps:**
  1. Note wallet type and address
  2. Reload the page
- **Expected:**
  - Top-right still shows the connected wallet with same name and status
  - Address matches (session restored from localStorage)

---

### E9. Disconnect wallet after page reload
- **Steps:**
  1. Connect wallet → reload page → disconnect
- **Expected:**
  - Disconnect works normally after session restore

---

## F. Wallet-Gated Sharing

### F1. Upload with wallet-gated access mode
- **Goal:** Verify wallet-gated upload flow
- **Preconditions:** Wallet connected (any provider)
- **Steps:**
  1. Go to Upload tab
  2. Select a file
  3. Set ACCESS_MODE to WALLET-GATED
  4. Verify RECIPIENT_WALLET input field appears
  5. Paste the connected wallet's address as recipient (copy from [COPY ADDRESS])
  6. Click ENCRYPT_AND_UPLOAD
- **Expected:**
  - Result card shows `ACCESS_MODE: WALLET-GATED → 0x71a3...8f2d`
  - Record in Vault tab shows `MODE: WALLET-GATED` and `TO: 0x71a3...8f2d`
  - Record stores `accessMode: "wallet-gated"`, `recipientWallet: "full_address"`, `createdByWallet: "sender_address"`
- **Events logged:** `FILE_ENCRYPTED`, `FILE_UPLOADED` with `[WALLET-GATED]` in message

---

### F2. Wallet-gated validation — empty recipient
- **Goal:** Verify validation before upload
- **Steps:**
  1. Set ACCESS_MODE to WALLET-GATED
  2. Leave RECIPIENT_WALLET field empty
  3. Select a file
  4. Click ENCRYPT_AND_UPLOAD
- **Expected:**
  - Error: "> WALLET-GATED: Please enter recipient wallet address."
  - Upload does NOT proceed

---

### ⭐ F3. Upload wallet-gated → download with WRONG wallet → WALLET_MISMATCH
- **Goal:** Core wallet-gated security test
- **Preconditions:** None
- **Steps:**
  1. Connect **Petra** wallet → copy address (Address A)
  2. Upload a file with ACCESS_MODE: WALLET-GATED, recipient = Address A
  3. Save the FILE_ID and DECRYPT_KEY
  4. Disconnect Petra wallet
  5. Connect **Phantom** wallet (gets a different address — Address B)
  6. Go to Download tab
  7. Paste the FILE_ID and DECRYPT_KEY from step 3
  8. Click DECRYPT_AND_DOWNLOAD
- **Expected:**
  - Error card: "> DOWNLOAD_FAILED"
  - Message: `WALLET_MISMATCH: Connected wallet (7KGdNy...t3hN) does not match the recipient wallet. Access denied.`
  - Download is BLOCKED before any decryption attempt
- **Events logged:** `WALLET_GATED_DENIED` with message "Wallet mismatch: 7KGdNy...t3hN ≠ expected"

---

### ⭐ F4. Upload wallet-gated → download with NO wallet → ACCESS_DENIED
- **Goal:** Verify wallet-gated blocks access when no wallet connected
- **Preconditions:** None
- **Steps:**
  1. Connect wallet → upload wallet-gated file → save FILE_ID and DECRYPT_KEY
  2. Disconnect wallet (top-right shows CONNECT_WALLET)
  3. Go to Download tab
  4. Paste FILE_ID and DECRYPT_KEY
  5. Click DECRYPT_AND_DOWNLOAD
- **Expected:**
  - Error: "ACCESS_DENIED: This file requires wallet authentication. Connect the recipient wallet first."
- **Events logged:** `WALLET_GATED_DENIED` with message "Wallet-gated denied: no wallet connected"

---

### ⭐ F5. Upload wallet-gated → connect CORRECT wallet → download SUCCESS
- **Goal:** Verify wallet-gated allows access with matching wallet
- **Preconditions:** Continue from F3 or F4
- **Steps:**
  1. Disconnect current wallet
  2. Reconnect the **same wallet type** used during upload (Note: mock generates a NEW random address each time — see note below)
  3. Since mock wallet generates new addresses each reconnect, this test requires a workaround:
     - **Option A:** Keep the same wallet session from upload (don't disconnect between upload and download)
     - **Option B:** Manually set `recipientWallet` in localStorage to match the newly connected wallet address
- **Steps (Option A — same session):**
  1. Connect Petra wallet
  2. Copy the address
  3. Upload file with WALLET-GATED, recipient = same connected address
  4. WITHOUT disconnecting, go to Download tab
  5. Paste FILE_ID and DECRYPT_KEY
  6. Click DECRYPT_AND_DOWNLOAD
- **Expected:**
  - Download succeeds
  - Integrity verified
  - File can be saved
- **Events logged:** `WALLET_GATED_ALLOWED`, `DOWNLOAD_ATTEMPT`, `DOWNLOAD_SUCCESS`, `INTEGRITY_VERIFIED`

> **⚠ Note:** Because mock wallets generate random addresses on each connect, testing with a "different session" for the same wallet won't produce a matching address. This is a known limitation of the mock implementation. Real SDK integration would maintain the user's actual wallet address.

---

### F6. Wallet-gated record shows access mode in vault
- **Steps:**
  1. Upload a file with each access mode: PASSPHRASE, PUBLIC LINK, WALLET-GATED
  2. Go to Vault tab
- **Expected:**
  - PASSPHRASE record shows `MODE: PASSPHRASE`
  - PUBLIC LINK record shows `MODE: PUBLIC`
  - WALLET-GATED record shows `MODE: WALLET-GATED` and `TO: {shortened address}`

---

## G. Inbox / Shared With Me

### G1. Inbox — no wallet connected
- **Goal:** Verify empty state when no wallet
- **Preconditions:** No wallet connected
- **Steps:**
  1. Click INBOX tab
- **Expected:**
  - Message: "> CONNECT WALLET TO LOAD INBOUND RELAYS_"
  - No records shown
  - Count badge: empty

---

### G2. Inbox — wallet connected but no incoming files
- **Goal:** Verify empty state with wallet but no relays
- **Preconditions:** Connect a wallet, no wallet-gated files addressed to it
- **Steps:**
  1. Connect any wallet
  2. Click INBOX tab
- **Expected:**
  - Message: "> NO INBOUND RELAYS FOR THIS WALLET_"

---

### G3. Inbox — wallet-gated record appears for correct recipient
- **Goal:** Verify inbox filtering
- **Preconditions:** None
- **Steps:**
  1. Connect Petra (get address A)
  2. Copy address A
  3. Upload file with WALLET-GATED, recipient = address A
  4. Go to INBOX tab
- **Expected:**
  - Record appears in inbox
  - Shows: file name, FROM (sender address or ANONYMOUS), SIZE, CREATED date, EXPIRES, MODE: WALLET-GATED
  - Status: ACTIVE
  - Actions: [OPEN / DOWNLOAD], [COPY ID]
  - Count: `[1 RELAYS]`

---

### G4. Inbox — wallet-gated record NOT visible for wrong wallet
- **Goal:** Verify inbox only shows files for the connected wallet
- **Preconditions:** Continue from G3
- **Steps:**
  1. Disconnect Petra
  2. Connect Phantom (gets address B, different from address A)
  3. Go to INBOX tab
- **Expected:**
  - Message: "> NO INBOUND RELAYS FOR THIS WALLET_"
  - The wallet-gated file from G3 is NOT visible

---

### G5. Inbox — open/download action
- **Goal:** Verify inbox item opens in Download tab
- **Preconditions:** Wallet-gated record visible in inbox (from G3)
- **Steps:**
  1. Click [OPEN / DOWNLOAD] on the inbox item
- **Expected:**
  - Switches to Download tab
  - File ID pre-filled in the FILE_ID input
  - Status message: "> Inbound relay loaded. Enter decrypt key to access."
  - User still needs to enter the DECRYPT_KEY manually

---

### G6. Inbox — disconnect wallet clears inbox
- **Preconditions:** Inbox showing records
- **Steps:**
  1. Disconnect wallet
  2. Click INBOX tab
- **Expected:**
  - Message reverts to "> CONNECT WALLET TO LOAD INBOUND RELAYS_"
  - No records shown

---

## H. Cross-Feature Integration Tests

### ⭐ H1. Full wallet-gated lifecycle
- **Goal:** End-to-end test of the complete wallet-gated flow
- **Steps:**
  1. Connect Petra wallet → copy address
  2. Sign session → status AUTHORIZED
  3. Upload file with WALLET-GATED + recipient = own address + expiration = 7 DAYS
  4. Save FILE_ID and DECRYPT_KEY
  5. Check Vault tab → record shows MODE: WALLET-GATED, TO: {address}, ACTIVE
  6. Check INBOX tab → record visible with correct metadata
  7. Click [OPEN / DOWNLOAD] from inbox → switches to Download tab
  8. Enter DECRYPT_KEY → download succeeds
  9. Verify integrity hash passes
  10. Check Protocol Events → all wallet + upload + download events logged chronologically
- **Expected at each step:** as described in individual tests above

---

### ⭐ H2. Revoke link → attempt download → fail
- **Steps:**
  1. Upload any file (PASSPHRASE mode)
  2. Save FILE_ID and DECRYPT_KEY
  3. Go to Vault → click [REVOKE]
  4. Go to Download → paste FILE_ID + DECRYPT_KEY → click download
- **Expected:**
  - Error: "LINK_REVOKED: This share link has been revoked by the owner."
  - Events: `LINK_REVOKED`, `DOWNLOAD_FAILED`

---

### ⭐ H3. ONE DL → download once → download again → consumed
- **Steps:**
  1. Upload file with ONE DL expiration
  2. Save FILE_ID and DECRYPT_KEY
  3. Download successfully (1st time)
  4. Check Vault → status: CONSUMED, DL: 1
  5. Try download again (2nd time)
- **Expected:**
  - 1st: success
  - 2nd: error "FILE_CONSUMED: This file was set to self-destruct after one download."
  - Vault stats: CONSUMED +1

---

### ⭐ H4. Panic wipe resets EVERYTHING
- **Steps:**
  1. Upload 3 files
  2. Connect wallet, sign session
  3. Upload a wallet-gated file
  4. Verify vault has 4 records, events logged, wallet connected
  5. Execute Panic Wipe (Vault tab → ⚠ PANIC_WIPE → CONFIRM_WIPE)
- **Expected:**
  - Vault: empty, 0 records
  - Statistics: all zeros
  - Protocol Events: only VAULT_WIPED event
  - Wallet: disconnected (CONNECT_WALLET shown)
  - INBOX: empty / "connect wallet" state
  - localStorage: cleared of all cipher-related keys

---

### H5. Share link auto-detection on page load
- **Steps:**
  1. Upload a file, copy the SHARE_LINK
  2. Open a new browser tab
  3. Paste the share link in the address bar and navigate
- **Expected:**
  - App opens directly on Download tab
  - FILE_ID pre-filled in the download input
  - Status: "> Share link detected. Enter decrypt key and download."

---

## Notes & Known Test Limitations

| Issue | Detail |
|-------|--------|
| **Mock wallet addresses** | Each `connectWallet()` call generates a NEW random address. You cannot reconnect to the "same" wallet address in mock mode. For wallet-gated download tests, keep the session alive. |
| **Sign session 15% rejection** | The mock randomly rejects 15% of sign requests. This is intentional but may require retry during testing. |
| **Expiration testing** | Time-based expiration (1h/1d/7d) is hard to test in real-time. Use DevTools to manually modify `expiresAt` in localStorage. |
| **localStorage size limits** | Uploading many large files will hit localStorage ~5MB limit. Test with small files (<100KB). |
| **Cross-browser clipboard** | `navigator.clipboard.writeText()` requires HTTPS or localhost. Direct `file://` access may fail clipboard operations. |
