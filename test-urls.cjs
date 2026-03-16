const http = require('http');

const urls = [
  'http://localhost:5173/node_modules/@shelby-protocol/clay-codes/dist/clay.wasm',
  'http://localhost:5173/clay.wasm',
  'http://localhost:5173/assets/clay.wasm'
];

urls.forEach(url => {
  http.get(url, res => {
    let rawData = '';
    res.on('data', chunk => rawData += chunk.toString('utf8', 0, 10)); // just read first 10 chars
    res.on('end', () => console.log(url, '->', res.statusCode, rawData.slice(0, 50)));
  }).on('error', err => console.error(err));
});
