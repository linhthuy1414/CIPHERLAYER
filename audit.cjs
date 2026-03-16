const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ raw: data.substring(0, 500) }); }
      });
    }).on('error', reject);
  });
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ raw: data.substring(0, 500) }); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const SHELBY_ADDR = '0x66188c3344001f2fc44645c531e47e74b2f1f1e54151197800181b1d1eecd547';
  const TX_HASH = '0x2881ff88c287766d4f7e8f275644f122f68d408c88ee7d442a47acc44ad5dc74';

  console.log('===== AUDIT STEP 1: Fetch txn sender =====');
  const txn = await fetchJSON(`https://fullnode.testnet.aptoslabs.com/v1/transactions/by_hash/${TX_HASH}`);
  console.log('sender:', txn.sender);
  console.log('success:', txn.success);
  console.log('vm_status:', txn.vm_status);
  console.log('type:', txn.type);
  const REAL_ADDR = txn.sender || SHELBY_ADDR;
  console.log('REAL_ADDR:', REAL_ADDR);

  console.log('\n===== AUDIT STEP 2: Check /resources for REAL_ADDR =====');
  const resources = await fetchJSON(`https://fullnode.testnet.aptoslabs.com/v1/accounts/${REAL_ADDR}/resources`);
  if (Array.isArray(resources)) {
    console.log('Total resources:', resources.length);
    const coinStores = resources.filter(r => r.type.includes('CoinStore'));
    console.log('CoinStore resources:', coinStores.length);
    coinStores.forEach(cs => {
      console.log('  type:', cs.type);
      console.log('  value:', cs.data?.coin?.value);
    });
    if (coinStores.length === 0) {
      console.log('  => NO CoinStore found in resources array');
    }
  } else {
    console.log('resources response:', JSON.stringify(resources).substring(0, 300));
  }

  console.log('\n===== AUDIT STEP 3: View function 0x1::coin::balance =====');
  const viewResult = await postJSON('https://fullnode.testnet.aptoslabs.com/v1/view', {
    function: '0x1::coin::balance',
    type_arguments: ['0x1::aptos_coin::AptosCoin'],
    arguments: [REAL_ADDR]
  });
  console.log('view result:', JSON.stringify(viewResult));

  console.log('\n===== AUDIT STEP 4: Check /account basic info =====');
  const acctInfo = await fetchJSON(`https://fullnode.testnet.aptoslabs.com/v1/accounts/${REAL_ADDR}`);
  console.log('account info:', JSON.stringify(acctInfo));

  console.log('\n===== AUDIT STEP 5: Compare addresses =====');
  console.log('Shelby explorer addr:', SHELBY_ADDR);
  console.log('Txn sender addr:    ', REAL_ADDR);
  console.log('Match:', SHELBY_ADDR === REAL_ADDR);
}

main().catch(console.error);
