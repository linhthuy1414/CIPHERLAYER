const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => logs.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => logs.push(`PAGE ERROR: ${err}`));
  
  page.on('request', req => {
      if (req.url().includes('wasm')) {
          console.log(`[NETWORK WASM FETCH] -> ${req.url()}`);
      }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  console.log('Testing Shelby WASM initialization...');
  await page.evaluate(async () => {
    try {
      const provider = window._ShelbySDK.createDefaultErasureCodingProvider(2);
      // Ensure we hit the WASM logic
      const out = await provider.encode(new Uint8Array(10), 10);
      console.log('Encode Success! WASM is working.', typeof out);
    } catch (e) {
      console.error('WASM Test Failed:', e.message);
    }
  });
  
  await page.waitForTimeout(2000);

  console.log('--- BROWSER LOGS ---');
  console.log(logs.filter(l => l.includes('WASM') || l.includes('clay.wasm') || l.includes('magic')).join('\n'));
  
  await browser.close();
})();
