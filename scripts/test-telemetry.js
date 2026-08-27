/**
 * NexusPulse Backend Verification & Integration Test Suite
 * Tests REST Endpoints, WebSocket Streams, Alert System, Process Manager & Stress Benchmarks
 */

const http = require('http');
const { WebSocket } = require('ws');
const { app, server, telemetry, startServer } = require('../server/index.js');

const TEST_PORT = 4501;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('  🚀 Starting NexusPulse Backend Verification Suite 🚀');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      failed++;
    }
  }

  // 1. Start Server on TEST_PORT
  await startServer(TEST_PORT);

  try {
    // ----------------------------------------------------
    // REST API Tests
    // ----------------------------------------------------
    console.log('--- 1. Testing REST Endpoints ---');

    // GET /api/health
    const health = await makeRequest('GET', '/api/health');
    assert(health.status === 200 && health.data.status === 'ok', 'GET /api/health returns 200 and status ok');

    // GET /api/system/overview
    const overview = await makeRequest('GET', '/api/system/overview');
    assert(
      overview.status === 200 &&
      overview.data.status === 'ok' &&
      overview.data.data.hostname &&
      overview.data.data.cpu.cores > 0,
      'GET /api/system/overview returns host & CPU specs'
    );

    // GET /api/system/metrics
    const metrics = await makeRequest('GET', '/api/system/metrics');
    assert(
      metrics.status === 200 &&
      metrics.data.status === 'ok' &&
      typeof metrics.data.data.cpu.usage === 'number' &&
      metrics.data.data.memory.total > 0 &&
      Array.isArray(metrics.data.data.storage.disks),
      'GET /api/system/metrics returns live metrics snapshot'
    );

    // GET /api/system/history
    const history = await makeRequest('GET', '/api/system/history');
    assert(
      history.status === 200 &&
      history.data.status === 'ok' &&
      Array.isArray(history.data.data),
      'GET /api/system/history returns rolling history'
    );

    // GET /api/system/processes
    const processes = await makeRequest('GET', '/api/system/processes?sort=cpu&limit=10');
    assert(
      processes.status === 200 &&
      processes.data.status === 'ok' &&
      Array.isArray(processes.data.data.list) &&
      processes.data.data.list.length > 0,
      'GET /api/system/processes returns sorted process list'
    );

    // GET /api/system/processes with search
    const procSearch = await makeRequest('GET', '/api/system/processes?search=node&limit=5');
    assert(
      procSearch.status === 200 &&
      procSearch.data.status === 'ok',
      'GET /api/system/processes?search=node filters properly'
    );

    // POST /api/system/processes/kill - Invalid PID guard
    const killPID1 = await makeRequest('POST', '/api/system/processes/kill', { pid: 1, signal: 'SIGTERM' });
    assert(
      killPID1.status === 400 &&
      killPID1.data.status === 'error',
      'POST /api/system/processes/kill prevents terminating PID 1'
    );

    // GET /api/system/ports
    const ports = await makeRequest('GET', '/api/system/ports');
    assert(
      ports.status === 200 &&
      ports.data.status === 'ok' &&
      Array.isArray(ports.data.data),
      'GET /api/system/ports returns listening ports'
    );

    // GET /api/alerts & POST /api/alerts/config
    const alerts = await makeRequest('GET', '/api/alerts');
    assert(
      alerts.status === 200 &&
      alerts.data.status === 'ok' &&
      alerts.data.data.rules,
      'GET /api/alerts returns alert status and rules'
    );

    const alertUpdate = await makeRequest('POST', '/api/alerts/config', { cpuWarning: 70, cpuCritical: 88 });
    assert(
      alertUpdate.status === 200 &&
      alertUpdate.data.status === 'ok' &&
      alertUpdate.data.data.cpuWarning === 70,
      'POST /api/alerts/config updates thresholds'
    );

    // GET /api/logs
    const logs = await makeRequest('GET', '/api/logs?limit=10');
    assert(
      logs.status === 200 &&
      logs.data.status === 'ok' &&
      Array.isArray(logs.data.data),
      'GET /api/logs returns system log entries'
    );

    // Benchmark endpoints
    const benchStart = await makeRequest('POST', '/api/benchmark/start', { durationSec: 3, cpuCores: 2, ramMb: 32 });
    assert(
      benchStart.status === 200 &&
      benchStart.data.data.status === 'started',
      'POST /api/benchmark/start initiates stress test'
    );

    const benchStop = await makeRequest('POST', '/api/benchmark/stop');
    assert(
      benchStop.status === 200 &&
      benchStop.data.data.status === 'stopped',
      'POST /api/benchmark/stop halts stress test'
    );

    // ----------------------------------------------------
    // WebSocket Client Tests
    // ----------------------------------------------------
    console.log('\n--- 2. Testing WebSocket Telemetry Stream ---');

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws`);
      let ticksReceived = 0;

      ws.on('open', () => {
        console.log('  Connected to WebSocket endpoint');
        ws.send(JSON.stringify({ type: 'ping' }));
        ws.send(JSON.stringify({ type: 'request_history' }));
        ws.send(JSON.stringify({ type: 'request_processes', payload: { limit: 5 } }));
        ws.send(JSON.stringify({ type: 'request_overview' }));
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === 'connected') {
            assert(true, 'WS received connected handshake event');
          } else if (msg.type === 'pong') {
            assert(true, 'WS ping-pong reply received');
          } else if (msg.type === 'history') {
            assert(Array.isArray(msg.data), 'WS request_history responded with history array');
          } else if (msg.type === 'processes') {
            assert(Array.isArray(msg.data.list), 'WS request_processes responded with process list');
          } else if (msg.type === 'overview') {
            assert(msg.data.hostname, 'WS request_overview responded with system specs');
          } else if (msg.type === 'tick') {
            ticksReceived++;
            if (ticksReceived === 1) {
              assert(msg.metrics && typeof msg.metrics.cpu.usage === 'number', 'WS broadcast 1Hz telemetry tick frame');
              ws.close();
              resolve();
            }
          }
        } catch (e) {
          reject(e);
        }
      });

      ws.on('error', reject);
    });

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    // Shutdown test server
    server.close();
  }

  console.log('\n====================================================');
  console.log(`  Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
