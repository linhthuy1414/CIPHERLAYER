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

async function main() {
  const TX = '0x2881ff88c287766d4f7e8f275644f122f68d408c88ee7d442a47acc44ad5dc74';
  const txn = await fetchJSON(`https://fullnode.testnet.aptoslabs.com/v1/transactions/by_hash/${TX}`);
  
  console.log('=== PAYLOAD ===');
  console.log(JSON.stringify(txn.payload, null, 2));
  
  console.log('\n=== ALL CHANGES (shortened) ===');
  if (txn.changes) {
    txn.changes.forEach((c, i) => {
      console.log(`[${i}] type: ${c.data?.type || c.type}`);
      if (c.data?.data) {
        const d = JSON.stringify(c.data.data);
        console.log(`    data: ${d.substring(0, 200)}`);
      }
    });
  }
  
  console.log('\n=== EVENTS ===');
  if (txn.events) {
    txn.events.forEach((e, i) => {
      console.log(`[${i}] type: ${e.type}, data: ${JSON.stringify(e.data).substring(0, 200)}`);
    });
  }
}

main().catch(console.error);
