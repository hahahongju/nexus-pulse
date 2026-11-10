const fs = require('fs');
const os = require('os');
const path = require('path');
const testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-telemetry-'));
process.env.NEXUSPULSE_CONFIG_DIR = testConfigDir;

const http = require('http');
const { WebSocket } = require('ws');
const { app, server, telemetry, startServer } = require('../server/index.js');
const authStore = require('../server/security/authStore.js');

const TEST_PORT = 4550;

function makeRequest(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...extraHeaders
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw });
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
  await authStore.setPin('1234');
  const masterToken = authStore.getMasterToken();
  const authHeaders = { 'Authorization': `Bearer ${masterToken}` };

  try {
    // ----------------------------------------------------
    // REST API Tests (Perimeter Guard & Authenticated Endpoints)
    // ----------------------------------------------------
    console.log('--- 1. Testing Perimeter Guard & Authenticated REST Endpoints ---');

    // GET /api/health (Public health check)
    const health = await makeRequest('GET', '/api/health');
    assert(health.status === 200 && health.data.status === 'ok', 'GET /api/health returns 200 and status ok');

    // Unauthenticated request to /api/system/metrics must be rejected with 401
    const unauthMetrics = await makeRequest('GET', '/api/system/metrics');
    assert(unauthMetrics.status === 401, 'Perimeter Gatekeeper blocks unauthenticated GET /api/system/metrics (401)');

    // Authenticated GET /api/system/overview
    const overview = await makeRequest('GET', '/api/system/overview', null, authHeaders);
    assert(
      overview.status === 200 &&
      overview.data.status === 'ok' &&
      overview.data.data.hostname &&
      overview.data.data.cpu.cores > 0,
      'GET /api/system/overview returns host & CPU specs with auth'
    );

    // Authenticated GET /api/system/metrics
    const metrics = await makeRequest('GET', '/api/system/metrics', null, authHeaders);
    assert(
      metrics.status === 200 &&
      metrics.data.status === 'ok' &&
      typeof metrics.data.data.cpu.usage === 'number' &&
      metrics.data.data.memory.total > 0 &&
      Array.isArray(metrics.data.data.storage.disks),
      'GET /api/system/metrics returns live metrics snapshot with auth'
    );

    // Authenticated GET /api/system/history
    const history = await makeRequest('GET', '/api/system/history', null, authHeaders);
    assert(
      history.status === 200 &&
      history.data.status === 'ok' &&
      Array.isArray(history.data.data),
      'GET /api/system/history returns rolling history with auth'
    );

    // Authenticated GET /api/system/processes
    const processes = await makeRequest('GET', '/api/system/processes?sort=cpu&limit=10', null, authHeaders);
    assert(
      processes.status === 200 &&
      processes.data.status === 'ok' &&
      Array.isArray(processes.data.data.list) &&
      processes.data.data.list.length > 0,
      'GET /api/system/processes returns sorted process list with auth'
    );

    // Authenticated GET /api/system/ports
    const ports = await makeRequest('GET', '/api/system/ports', null, authHeaders);
    assert(
      ports.status === 200 &&
      ports.data.status === 'ok' &&
      Array.isArray(ports.data.data),
      'GET /api/system/ports returns listening ports with auth'
    );

    // Authenticated GET /api/alerts
    const alerts = await makeRequest('GET', '/api/alerts', null, authHeaders);
    assert(
      alerts.status === 200 &&
      alerts.data.status === 'ok' &&
      alerts.data.data.rules,
      'GET /api/alerts returns alert status and rules with auth'
    );

    // Authenticated GET /api/logs
    const logs = await makeRequest('GET', '/api/logs?limit=10', null, authHeaders);
    assert(
      logs.status === 200 &&
      logs.data.status === 'ok' &&
      Array.isArray(logs.data.data),
      'GET /api/logs returns system log entries with auth'
    );

    // ----------------------------------------------------
    // Security Gateway & Embedded Vector DB Tests
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Security Gateway & Embedded Vector DB ---');

    // Security Status endpoint
    const secStatus = await makeRequest('GET', '/api/security/status');
    assert(secStatus.data.localMasterToken === null, 'Public status never exposes master credentials');
    assert(
      secStatus.status === 200 &&
      secStatus.data.masterConfigured === true &&
      secStatus.data.vectorDb.type === 'vectra-embedded',
      'GET /api/security/status reports embedded vector DB active'
    );

    // Unauthenticated mutating request blocked
    const unauthMutate = await makeRequest('POST', '/api/alerts/config', { cpuWarning: 80 });
    assert(
      unauthMutate.status === 401 &&
      unauthMutate.data.code === 'UNAUTHORIZED',
      'Security Proxy blocks unauthenticated mutating requests (401 Unauthorized)'
    );

    // Malicious Cross-Origin request blocked
    const corsBlock = await makeRequest('POST', '/api/alerts/config', { cpuWarning: 80 }, {
      'Origin': 'https://attacker.evil.com',
      ...authHeaders
    });
    assert(
      corsBlock.status === 403 &&
      corsBlock.data.code === 'FORBIDDEN_ORIGIN',
      'Security Proxy rejects untrusted Cross-Origin requests (403 Forbidden)'
    );

    // Trusted Private LAN Origin allowed
    const lanCors = await makeRequest('OPTIONS', '/api/system/metrics', null, {
      'Origin': 'http://192.168.0.50:4500'
    });
    assert(
      lanCors.status === 204 &&
      lanCors.headers['access-control-allow-origin'] === 'http://192.168.0.50:4500',
      'Security Proxy allows Private LAN Origin (192.168.0.*) with dynamic CORS'
    );

    // ----------------------------------------------------
    // User-Friendly PIN & Session Authentication Tests
    // ----------------------------------------------------
    console.log('\n--- 2.5 Testing User-Friendly PIN & Session Authentication ---');

    // Test PIN Login with incorrect PIN
    const badLogin = await makeRequest('POST', '/api/security/login', { pin: 'wrong999' });
    assert(
      badLogin.status === 401 && badLogin.data.code === 'INVALID_CREDENTIALS',
      'POST /api/security/login rejects incorrect PIN with remaining attempts'
    );

    // Test PIN Login with default PIN (1234)
    const pinLogin = await makeRequest('POST', '/api/security/login', { pin: '1234', rememberMe: true });
    assert(
      pinLogin.status === 200 &&
      pinLogin.data.data.sessionToken &&
      pinLogin.data.data.user.isMaster === false &&
      pinLogin.data.data.expiresAt > Date.now() + 23 * 60 * 60 * 1000 &&
      pinLogin.data.data.expiresAt <= Date.now() + 24 * 60 * 60 * 1000,
      'POST /api/security/login authenticates with default PIN and creates 24-hour session'
    );
    const sessionToken = pinLogin.data.data.sessionToken;
    const sessionHeaders = { 'Authorization': `Bearer ${sessionToken}` };

    // Use session token through Security Proxy for mutating operation
    const sessionMutate = await makeRequest('POST', '/api/alerts/config', { cpuWarning: 75 }, sessionHeaders);
    assert(
      sessionMutate.status === 200 && sessionMutate.data.status === 'ok',
      'Security Proxy validates session token from PIN login for mutating requests'
    );

    // Test PIN Change
    const changePinRes = await makeRequest('POST', '/api/security/pin/change', {
      currentPin: '1234',
      newPin: '5678'
    }, sessionHeaders);
    assert(
      changePinRes.status === 200 && changePinRes.data.status === 'ok',
      'POST /api/security/pin/change successfully updates PIN with PBKDF2 salt hash'
    );

    // Verify login with new PIN
    const newPinLogin = await makeRequest('POST', '/api/security/login', { pin: '5678' });
    assert(
      newPinLogin.status === 200 && newPinLogin.data.data.sessionToken,
      'POST /api/security/login validates newly changed PIN'
    );

    // Revert PIN back to 1234 for consistency
    sessionHeaders.Authorization = `Bearer ${newPinLogin.data.data.sessionToken}`;
    await makeRequest('POST', '/api/security/pin/change', { currentPin: '5678', newPin: '1234' }, sessionHeaders);
    const refreshedSessionLogin = await makeRequest('POST', '/api/security/login', { pin: '1234' });
    sessionHeaders.Authorization = `Bearer ${refreshedSessionLogin.data.data.sessionToken}`;

    // Test Logout
    const logoutRes = await makeRequest('POST', '/api/security/logout', null, sessionHeaders);
    const loggedOutRequest = await makeRequest('GET', '/api/system/metrics', null, sessionHeaders);
    assert(
      logoutRes.status === 200 && loggedOutRequest.status === 401,
      'POST /api/security/logout revokes session token'
    );

    // ----------------------------------------------------
    // 2-Factor Authentication (Google / MS Authenticator) Tests
    // ----------------------------------------------------
    console.log('\n--- 2.6 Testing Google / MS Authenticator 2FA ---');

    // 1. Setup 2FA
    const setup2FARes = await makeRequest('POST', '/api/security/2fa/setup', null, authHeaders);
    assert(
      setup2FARes.status === 200 &&
      setup2FARes.data.data.secret &&
      setup2FARes.data.data.qrCodeDataUrl.startsWith('data:image/png;base64,') &&
      Array.isArray(setup2FARes.data.data.backupCodes),
      'POST /api/security/2fa/setup generates QR Code data URL, Base32 secret, and backup codes'
    );
    const totpSecret = setup2FARes.data.data.secret;
    const backupCodes = setup2FARes.data.data.backupCodes;
    const validTOTP = authStore.generateTOTP(totpSecret);

    // 2. Enable 2FA with incorrect code (should fail)
    const badEnable = await makeRequest('POST', '/api/security/2fa/enable', {
      secret: totpSecret,
      code: '000000',
      backupCodes
    }, authHeaders);
    assert(
      badEnable.status === 400,
      'POST /api/security/2fa/enable rejects invalid 6-digit TOTP code'
    );

    // 3. Enable 2FA with valid TOTP code
    const enable2FARes = await makeRequest('POST', '/api/security/2fa/enable', {
      secret: totpSecret,
      code: validTOTP,
      backupCodes
    }, authHeaders);
    assert(
      enable2FARes.status === 200 && enable2FARes.data.status === 'ok',
      'POST /api/security/2fa/enable activates Google/MS Authenticator 2FA'
    );

    // 4. Verify 2FA status in security endpoint
    const secStatus2FA = await makeRequest('GET', '/api/security/status');
    const replaceOtp = await makeRequest('POST', '/api/security/2fa/enable', {
      secret: totpSecret, code: authStore.generateTOTP(totpSecret), backupCodes: setup2FARes.data.data.backupCodes
    }, authHeaders);
    assert(replaceOtp.status === 409, 'Existing OTP cannot be overwritten');
    const viewer = await makeRequest('POST', '/api/security/tokens', { role: 'viewer' }, authHeaders);
    const viewerHeaders = { Authorization: `Bearer ${viewer.data.data.token}` };
    const forbiddenAdmin = await makeRequest('GET', '/api/security/tokens', null, viewerHeaders);
    const forbiddenMutation = await makeRequest('POST', '/api/alerts/config', { cpuWarning: 80 }, viewerHeaders);
    assert(forbiddenAdmin.status === 403 && forbiddenMutation.status === 403, 'Viewer cannot administer security or mutate state');
    for (const prefix of ['/api/v1', '/API/V1', '/api']) {
      const denied = await makeRequest('GET', `${prefix}/SeCuRiTy/tokens/`, null, viewerHeaders);
      assert(denied.status === 403, `Viewer cannot bypass security via ${prefix}`);
    }
    await new Promise((resolve, reject) => {
      const guest = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws`);
      guest.on('unexpected-response', (req, res) => { assert(res.statusCode === 401, 'WebSocket rejects unauthenticated upgrades'); res.resume(); req.destroy(); resolve(); });
      guest.on('open', () => { guest.close(); reject(new Error('Guest WebSocket accepted')); });
      guest.on('error', () => {});
    });
    assert(
      secStatus2FA.status === 200 && secStatus2FA.data.pin.twoFactorEnabled === true,
      'GET /api/security/status confirms twoFactorEnabled is true'
    );

    // 5. Test 2-Step Login with PIN
    const loginStep1 = await makeRequest('POST', '/api/security/login', { pin: '1234' });
    assert(
      loginStep1.status === 200 &&
      loginStep1.data.require2FA === true &&
      loginStep1.data.tempToken,
      'POST /api/security/login requires 2FA second step when 2FA is enabled'
    );
    const temp2FAToken = loginStep1.data.tempToken;

    // 6. Test 2FA verification with bad code
    const bad2FAVerify = await makeRequest('POST', '/api/security/2fa/verify-login', {
      tempToken: temp2FAToken,
      code: '999999'
    });
    assert(
      bad2FAVerify.status === 401 && bad2FAVerify.data.code === 'INVALID_2FA_CODE',
      'POST /api/security/2fa/verify-login rejects incorrect TOTP code'
    );

    // 7. Test 2FA verification with valid TOTP code
    const currentValidTOTP = authStore.generateTOTP(totpSecret);
    const good2FAVerify = await makeRequest('POST', '/api/security/2fa/verify-login', {
      tempToken: temp2FAToken,
      code: currentValidTOTP
    });
    assert(
      good2FAVerify.status === 200 &&
      good2FAVerify.data.data.sessionToken &&
      good2FAVerify.data.data.user.isMaster === false,
      'POST /api/security/2fa/verify-login confirms TOTP code and creates authenticated session'
    );

    // 8. Disable 2FA for test clean up
    const disableTOTP = authStore.generateTOTP(totpSecret);
    const disableRes = await makeRequest('POST', '/api/security/2fa/disable', {
      code: disableTOTP
    }, authHeaders);
    assert(
      disableRes.status === 200 && disableRes.data.status === 'ok',
      'POST /api/security/2fa/disable deactivates 2FA'
    );

    // Verify Master Token via Vector DB
    const verifyRes = await makeRequest('POST', '/api/security/verify', { token: masterToken });
    assert(
      verifyRes.status === 200 &&
      verifyRes.data.data.valid === true &&
      verifyRes.data.data.user.isMaster === true,
      'POST /api/security/verify confirms Master Token via Vector DB'
    );

    // Issue new operator token backed by Vector DB
    const issueRes = await makeRequest('POST', '/api/security/tokens', { name: 'Tablet Client', role: 'operator' }, authHeaders);
    assert(
      issueRes.status === 201 &&
      issueRes.data.data.token &&
      issueRes.data.data.role === 'operator',
      'POST /api/security/tokens registers new token in Embedded Vector DB'
    );
    const newToken = issueRes.data.data.token;
    const newTokenId = issueRes.data.data.id;

    // Verify new token with vector cosine similarity
    const verifyNew = await makeRequest('POST', '/api/security/verify', { token: newToken });
    assert(
      verifyNew.status === 200 &&
      verifyNew.data.data.valid === true &&
      verifyNew.data.data.user.name === 'Tablet Client',
      'Vector DB cosine matching successfully authenticates newly registered token'
    );

    // Revoke token
    const revokeRes = await makeRequest('DELETE', `/api/security/tokens/${newTokenId}`, null, authHeaders);
    assert(
      revokeRes.status === 200 &&
      revokeRes.data.data.success === true,
      'DELETE /api/security/tokens/:id successfully revokes token from Vector DB'
    );

    // ----------------------------------------------------
    // Authorized Mutating Operations
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Authorized Mutating Operations ---');

    // POST /api/system/processes/kill - Invalid PID guard with auth
    const killPID1 = await makeRequest('POST', '/api/system/processes/kill', { pid: 1, signal: 'SIGTERM' }, authHeaders);
    assert(
      killPID1.status === 400 &&
      killPID1.data.status === 'error',
      'Authorized POST /api/system/processes/kill prevents terminating PID 1'
    );

    // POST /api/alerts/config with auth
    const alertUpdate = await makeRequest('POST', '/api/alerts/config', { cpuWarning: 70, cpuCritical: 88 }, authHeaders);
    assert(
      alertUpdate.status === 200 &&
      alertUpdate.data.status === 'ok' &&
      alertUpdate.data.data.cpuWarning === 70,
      'Authorized POST /api/alerts/config updates thresholds'
    );

    // POST /api/benchmark/start with auth
    const benchStart = await makeRequest('POST', '/api/benchmark/start', { durationSec: 3, cpuCores: 2, ramMb: 32 }, authHeaders);
    assert(
      benchStart.status === 200 &&
      benchStart.data.data.status === 'started',
      'Authorized POST /api/benchmark/start initiates stress test'
    );

    // POST /api/benchmark/stop with auth
    const benchStop = await makeRequest('POST', '/api/benchmark/stop', null, authHeaders);
    assert(
      benchStop.status === 200 &&
      benchStop.data.data.status === 'stopped',
      'Authorized POST /api/benchmark/stop halts stress test'
    );

    // ----------------------------------------------------
    // WebSocket Client & Telemetry Stream Tests
    // ----------------------------------------------------
    console.log('\n--- 4. Testing WebSocket Telemetry Stream & Auth ---');

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws?token=${masterToken}`);
      let ticksReceived = 0;

      ws.on('open', () => {
        console.log('  Connected to WebSocket endpoint with auth token');
        ws.send(JSON.stringify({ type: 'ping' }));
        ws.send(JSON.stringify({ type: 'request_history' }));
        ws.send(JSON.stringify({ type: 'request_processes', payload: { limit: 5 } }));
        ws.send(JSON.stringify({ type: 'request_overview' }));
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === 'init') {
            assert(msg.authenticated === true, 'WS init frame confirms authenticated status');
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
    try {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    } catch (e) {}
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
