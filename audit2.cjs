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

async function main() {
  const addrs = [
    { label: 'TXN_SENDER',      addr: '0xffffffffff5db607152e4a80a86d2953c413be3ed427f9cdfdd05b2e404524c4' },
    { label: 'SHELBY_EXPLORER',  addr: '0x66188c3344001f2fc44645c531e47e74b2f1f1e54151197800181b1d1eecd547' },
    { label: 'PREV_TEST_ADDR',   addr: '0x661876bd653ebf7fb12ad8f3dc330caff7c6ceb0ee9bc64e48b898124239d547' },
  ];

  for (const { label, addr } of addrs) {
    console.log(`\n===== ${label}: ${addr.slice(0,12)}...${addr.slice(-6)} =====`);
    try {
      const r = await postJSON('https://fullnode.testnet.aptoslabs.com/v1/view', {
        function: '0x1::coin::balance',
        type_arguments: ['0x1::aptos_coin::AptosCoin'],
        arguments: [addr]
      });
      if (Array.isArray(r) && r.length > 0) {
        const raw = parseInt(r[0], 10);
        console.log(`  APT balance (raw): ${r[0]}`);
        console.log(`  APT balance:       ${(raw / 1e8).toFixed(4)} APT`);
      } else {
        console.log('  view result:', JSON.stringify(r));
      }
    } catch(e) {
      console.log('  Error:', e.message);
    }
  }
}

main().catch(console.error);
