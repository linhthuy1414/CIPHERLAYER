const https = require('https');

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = { hostname: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' } };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({ raw: data.substring(0, 500) }); } });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const ADDR = '0x66188c3344001f2fc44645c531e47e74b2f1f1e54151197800181b1d1eecd547';
  const SHELBY_METADATA = '0x1b18363a9f1fe5e6ebf247daba5cc1c18052bb232efdc4c50f556053922d98e1';

  console.log('===== ShelbyUSD via primary_fungible_store::balance =====');
  const res = await postJSON('https://fullnode.testnet.aptoslabs.com/v1/view', {
    function: '0x1::primary_fungible_store::balance',
    type_arguments: ['0x1::fungible_asset::Metadata'],
    arguments: [ADDR, SHELBY_METADATA]
  });
  console.log('Result:', JSON.stringify(res));
  if (Array.isArray(res) && res.length > 0) {
    const raw = parseInt(res[0], 10);
    // txn showed decimals from coin, let's check what ShelbyUSD uses
    // from the txn: user got 100000000 which is 1.0 ShelbyUSD = 8 decimals? or 6?
    console.log('Raw:', raw);
    console.log('If 6 decimals:', (raw / 1e6).toFixed(6));
    console.log('If 8 decimals:', (raw / 1e8).toFixed(8));
  }
}

main().catch(console.error);
