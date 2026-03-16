const https = require('https');
function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({ raw: data.substring(0, 500) }); } });
    }); req.on('error', reject); req.write(JSON.stringify(body)); req.end();
  });
}
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({ raw: data.substring(0, 500) }); } });
    }).on('error', reject);
  });
}
async function main() {
  // Get ShelbyUSD metadata to find decimals
  const META = '0x1b18363a9f1fe5e6ebf247daba5cc1c18052bb232efdc4c50f556053922d98e1';
  const res = await fetchJSON(`https://fullnode.testnet.aptoslabs.com/v1/accounts/${META}/resource/0x1::fungible_asset::Metadata`);
  console.log('ShelbyUSD Metadata:', JSON.stringify(res, null, 2));
}
main().catch(console.error);
