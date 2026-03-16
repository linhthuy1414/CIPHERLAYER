const https = require('https');

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

async function main() {
  const ADDR = '0x66188c3344001f2fc44645c531e47e74b2f1f1e54151197800181b1d1eecd547';

  // Test APT via view function (PROOF for fix)
  console.log('===== APT via view function =====');
  const aptRes = await postJSON('https://fullnode.testnet.aptoslabs.com/v1/view', {
    function: '0x1::coin::balance',
    type_arguments: ['0x1::aptos_coin::AptosCoin'],
    arguments: [ADDR]
  });
  const aptRaw = parseInt(aptRes[0], 10);
  console.log('Raw:', aptRes[0], '→', (aptRaw / 1e8).toFixed(4), 'APT ✓');

  // Find Shelby coin types - check common patterns
  const shelbyTypes = [
    '0x5a7813f84f50a1e3bfb1078cc62ce0bebb0deb701738bf11f5bc71cbc8483040::shelby_usd::ShelbyUSD',
    '0x5a7813f84f50a1e3bfb1078cc62ce0bebb0deb701738bf11f5bc71cbc8483040::coin::ShelbyUSD',
  ];

  console.log('\n===== ShelbyUSD via view function =====');
  for (const coinType of shelbyTypes) {
    try {
      const res = await postJSON('https://fullnode.testnet.aptoslabs.com/v1/view', {
        function: '0x1::coin::balance',
        type_arguments: [coinType],
        arguments: [ADDR]
      });
      console.log(`${coinType.slice(-30)}: ${JSON.stringify(res)}`);
    } catch(e) {
      console.log(`${coinType.slice(-30)}: Error - ${e.message}`);
    }
  }

  // Check the txn to find what coin types were involved
  console.log('\n===== Txn payload =====');
  const txn = await fetchJSON('https://fullnode.testnet.aptoslabs.com/v1/transactions/by_hash/0x2881ff88c287766d4f7e8f275644f122f68d408c88ee7d442a47acc44ad5dc74');
  console.log('payload.function:', txn.payload?.function);
  if (txn.payload?.type_arguments) console.log('type_args:', txn.payload.type_arguments);
  if (txn.changes) {
    const coinChanges = txn.changes.filter(c => c.data && c.data.type && (c.data.type.includes('Coin') || c.data.type.includes('shelby')));
    coinChanges.forEach(c => {
      console.log('change.type:', c.data.type, 'value:', c.data?.data?.coin?.value || c.data?.data?.balance);
    });
  }
}

main().catch(console.error);
