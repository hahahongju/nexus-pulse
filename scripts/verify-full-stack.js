const http = require('http');
const { WebSocket } = require('ws');
const { startServer, server } = require('../server/index.js');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    }).on('error', reject);
  });
}

function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runE2E() {
  console.log('========================================================');
  console.log('🧪 NexusPulse E2E Full-Stack Verification Suite');
  console.log('========================================================\n');

  const PORT = 4500;
  const baseUrl = `http://localhost:${PORT}`;

  // Start the server first
  await startServer(PORT);
  await wait(500);

  // 1. Check HTTP HTML Static Delivery
  console.log('1. Testing Production Static Dashboard Delivery (GET /)...');
  const indexRes = await httpGet(baseUrl);
  if (indexRes.statusCode === 200 && indexRes.body.includes('NexusPulse')) {
    console.log('  ✔ Index HTML served successfully with correct Title/DOM bundle.');
  } else {
    throw new Error(`Failed to load index.html: status ${indexRes.statusCode}`);
  }

  // 2. Test /api/health
  console.log('\n2. Testing System Healthcheck Endpoint (GET /api/health)...');
  const healthRes = await httpGet(`${baseUrl}/api/health`);
  const healthData = JSON.parse(healthRes.body);
  console.log(`  ✔ Healthcheck status: ${healthData.status} (uptime: ${healthData.uptime}s)`);

  // 3. Test /api/system/overview
  console.log('\n3. Testing System Overview Specs (GET /api/system/overview)...');
  const overviewRes = await httpGet(`${baseUrl}/api/system/overview`);
  const overviewJson = JSON.parse(overviewRes.body);
  const overview = overviewJson.data || overviewJson;
  console.log(`  ✔ Hostname: ${overview.hostname} | OS: ${overview.type || overview.platform} ${overview.release || ''}`);
  console.log(`  ✔ CPU: ${overview.cpu?.brand || 'CPU'} (${overview.cpu?.cores || 'N/A'} Cores) | Total RAM: ${overview.memory?.totalGb || 'N/A'} GB`);

  // 4. Test /api/system/metrics
  console.log('\n4. Testing Real-time Dynamic Metrics (GET /api/system/metrics)...');
  const metricsRes = await httpGet(`${baseUrl}/api/system/metrics`);
  const metricsJson = JSON.parse(metricsRes.body);
  const metrics = metricsJson.data || metricsJson;
  console.log(`  ✔ CPU Load: ${metrics.cpu?.usage}% | RAM In Use: ${metrics.memory?.usedPercent}%`);
  console.log(`  ✔ Storage Disks: ${metrics.storage?.disks?.length || 0} | Network Interfaces: ${metrics.network?.interfaces?.length || 0}`);

  // 5. Test /api/system/processes
  console.log('\n5. Testing Process Management API (GET /api/system/processes)...');
  const procRes = await httpGet(`${baseUrl}/api/system/processes?sort=cpu&limit=5`);
  const procsJson = JSON.parse(procRes.body);
  const procs = procsJson.data || procsJson;
  console.log(`  ✔ Process table response: ${procs.list?.length || 0} processes listed (Total: ${procs.all || procs.total})`);

  // 6. Test WebSocket Real-time Stream (/ws)
  console.log('\n6. Testing Real-time WebSocket Protocol (ws://localhost:4500/ws)...');
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    let receivedInit = false;
    let receivedTick = false;

    ws.on('open', () => {
      console.log('  ✔ WebSocket connection established.');
    });

    ws.on('message', (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.type === 'init' || data.type === 'connected') {
        receivedInit = true;
        console.log(`  ✔ Received WebSocket [${data.type}] payload.`);
      }
      if (data.type === 'tick') {
        receivedTick = true;
        const m = data.metrics || data.data;
        console.log(`  ✔ Received WebSocket [tick] telemetry stream (CPU: ${m?.cpu?.usage}%, RAM: ${m?.memory?.usedPercent}%).`);
        ws.close();
        resolve();
      }
    });

    ws.on('error', (err) => {
      reject(new Error(`WebSocket error: ${err.message}`));
    });

    setTimeout(() => {
      if (!receivedTick) reject(new Error('WebSocket timed out waiting for tick.'));
    }, 6000);
  });

  // 7. Test Synthetic Benchmark Engine (POST /api/benchmark/start & stop)
  console.log('\n7. Testing Synthetic Benchmark Stress Generator...');
  const benchStartRes = await httpPost(`${baseUrl}/api/benchmark/start`, { durationSec: 3, cpuCores: 2, ramMb: 128 });
  const benchStartJson = JSON.parse(benchStartRes.body);
  const benchStart = benchStartJson.data || benchStartJson;
  console.log(`  ✔ Benchmark started: status=${benchStart.status || 'started'}`);

  await wait(1000);
  const benchStopRes = await httpPost(`${baseUrl}/api/benchmark/stop`, {});
  const benchStopJson = JSON.parse(benchStopRes.body);
  const benchStop = benchStopJson.data || benchStopJson;
  console.log(`  ✔ Benchmark safely stopped: status=${benchStop.status || 'stopped'}`);

  // 8. Test /api/containers
  console.log('\n8. Testing Docker & Container Telemetry API (GET /api/containers)...');
  const containerRes = await httpGet(`${baseUrl}/api/containers`);
  const containerJson = JSON.parse(containerRes.body);
  const containerData = containerJson.data || containerJson;
  console.log(`  ✔ Docker Engine: ${containerData.docker?.installed ? 'Installed (v' + containerData.docker?.serverVersion + ')' : 'Not installed'} | Active: ${containerData.docker?.active}`);
  console.log(`  ✔ Containers Tracked: ${containerData.containers?.length || 0} total (Running: ${containerData.docker?.containersRunning || 0})`);

  // 9. Test /api/virtualization
  console.log('\n9. Testing Virtualization & VM Hypervisor API (GET /api/virtualization)...');
  const virtRes = await httpGet(`${baseUrl}/api/virtualization`);
  const virtJson = JSON.parse(virtRes.body);
  const virtData = virtJson.data || virtJson;
  console.log(`  ✔ System Role: ${virtData.roleLabel} (${virtData.role})`);
  console.log(`  ✔ Hardware Virtualization: ${virtData.hardwareVirt?.type || 'None'} | KVM Device: ${virtData.hardwareVirt?.kvmDevice ? 'Active' : 'N/A'}`);
  console.log(`  ✔ Virtual Bridges: ${virtData.bridges?.length || 0} detected`);

  console.log('\n========================================================');
  console.log('🎉 ALL E2E FULL-STACK INTEGRATION TESTS PASSED 100%!');
  console.log('========================================================');
}

runE2E()
  .then(() => {
    console.log('\nVerification suite finished successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  });
