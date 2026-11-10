const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('../browser-test/node_modules/puppeteer');

(async () => {
  const { createServer } = await import('../client/node_modules/vite/dist/node/index.js');
  const server = await createServer({
    root: path.resolve(__dirname, '../client'),
    server: { host: '127.0.0.1', port: 4517, strictPort: true },
    plugins: [{ name: 'reconnect-test', configureServer(server) {
      server.middlewares.use('/reconnect-test', async (_req, res, next) => {
    try {
      const html = await server.transformIndexHtml('/reconnect-test', `
        <html><body><div id="root"></div><script type="module">
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import { DownloadCenter } from '/src/components/DownloadCenter.tsx';
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DownloadCenter));
        </script></body></html>`);
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
    } catch (error) { next(error); }
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('pageerror', error => console.error(error));
    let mode = 'offline';
    let probes = 0;
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (!url.includes('/api/downloads/')) return void request.continue();
      if (url.endsWith('/transmission')) {
        probes++;
        if (mode === 'timeout') return; // Deliberately leave the request hanging.
        if (mode === 'network-error') return void request.abort();
        return void request.respond({ contentType: 'application/json', body: JSON.stringify({
          data: { connected: mode === 'online', torrents: [] },
        }) });
      }
      // Unrelated endpoints must not block torrent recovery.
      return void request.respond({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
    });
    const waitForStatus = text => page.waitForFunction(
      value => [...document.querySelectorAll('.stitch-panel')].some(
        element => element.textContent === `토렌트${value}`,
      ), { timeout: 20000 }, text,
    );
    await page.goto('http://127.0.0.1:4517/reconnect-test');
    await waitForStatus('재연결 대기 중');
    mode = 'online';
    await waitForStatus('연결됨');
    mode = 'network-error';
    await waitForStatus('재연결 대기 중');
    mode = 'online';
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitForStatus('연결됨');
    mode = 'timeout';
    await waitForStatus('재연결 대기 중');
    mode = 'online';
    await waitForStatus('연결됨');
    assert.ok(probes >= 6);
    console.log('PASS: late startup, independent polling, network recovery, and timeout recovery');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
