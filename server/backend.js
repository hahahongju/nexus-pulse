/**
 * NexusPulse Server Entrypoint
 * Express REST API & WebSocket Real-Time Telemetry Streaming Engine
 * 
 * Features:
 * - High-speed WebSocket server broadcasting 1Hz telemetry ticks and alerts
 * - Full REST API for system overview, metrics, history, processes, ports, logs, alerts, benchmark
 * - Static SPA file serving for client application
 * - Graceful shutdown and resilient error handling
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const telemetry = require('./telemetry');
const downloads = require('./downloadManager');
const proxyGateway = require('./security/proxyGateway');
const authStore = proxyGateway.authStore;

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
  next();
});
const DEFAULT_PORT = parseInt(process.env.INTERNAL_PORT, 10) || 4501;

// ==========================================
// Middleware Configuration
// ==========================================

// Strict Dynamic CORS & Origin Guard (Allows loopback, LAN 192.168.*, Tailscale 100.*, Same-Origin)
app.use(proxyGateway.corsMiddleware);

// Global Sliding-Window Rate Limiter (300 req/min per IP)
app.use(proxyGateway.rateLimiter.middleware('global', 300, 60000));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Request logging for API calls (excluding high-frequency health checks)
app.use((req, res, next) => {
  if (req.path.startsWith('/api') && req.path !== '/api/health') {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (res.statusCode >= 400) {
        console.warn(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
      }
    });
  }
  next();
});

// Authentication Guard (Verifies Authorization: Bearer <token> or X-Nexus-Token)
app.use(proxyGateway.authGuard());

// ==========================================
// REST API Routes
// ==========================================

const apiRouter = express.Router();

/**
 * GET /api/health
 * Server health check and uptime
 */
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NexusPulse Telemetry Server',
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    systemUptime: Math.round(os.uptime()),
    timestamp: Date.now()
  });
});

/**
 * Security & Vector DB Authentication Management
 */
apiRouter.get('/security/status', (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || '';
  const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp.includes('127.0.0.1');
  const pinStatus = authStore.getPinStatus();
  const lockout = authStore.checkLockout(clientIp);

  res.json({
    status: 'ok',
    authenticated: !!req.user,
    user: req.user ? {
      name: req.user.name,
      role: req.user.role,
      isMaster: req.user.isMaster,
      createdAt: req.user.createdAt
    } : null,
    pin: {
      isConfigured: pinStatus.isConfigured,
      isInitialPin: pinStatus.isInitialPin,
      defaultPinHint: pinStatus.defaultPinHint,
      twoFactorEnabled: pinStatus.twoFactorEnabled
    },
    lockout: {
      locked: lockout.locked,
      remainingSec: lockout.remainingSec,
      attemptsRemaining: lockout.attemptsRemaining
    },
    masterConfigured: !!authStore.getMasterToken(),
    localMasterToken: null,
    vectorDb: {
      type: 'vectra-embedded',
      activeTokensCount: authStore.listTokens().length,
      mode: 'lightweight-in-process'
    }
  });
});

/**
 * POST /api/security/login
 * User-friendly PIN & Passphrase Login with Brute-Force Shield and 30-day Session creation
 */
apiRouter.post('/security/login', async (req, res) => {
  if (authStore.get2FAConfig().unavailable) return res.status(503).json({ status: 'error', message: '인증 설정을 읽을 수 없습니다. 서버 설정을 확인하세요.' });
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const lockout = authStore.checkLockout(clientIp);
  if (lockout.locked) {
    return res.status(429).json({
      status: 'error',
      code: 'LOCKOUT',
      message: `비밀번호 5회 연속 오입력으로 일시 차단되었습니다. ${lockout.remainingSec}초 후에 다시 시도하세요.`,
      remainingSec: lockout.remainingSec
    });
  }

  const { pin, password, token, deviceName = 'Browser Dashboard', rememberMe = true } = req.body || {};
  const candidate = pin || password || token;

  if (!candidate || typeof candidate !== 'string' || !candidate.trim()) {
    return res.status(400).json({ status: 'error', message: 'PIN 번호 또는 비밀번호를 입력해주세요.' });
  }

  const isValid = authStore.verifyPin(candidate);
  if (!isValid) {
    const afterFail = authStore.recordFailedLogin(clientIp);
    if (afterFail.locked) {
      return res.status(429).json({
        status: 'error',
        code: 'LOCKOUT',
        message: '비밀번호 5회 연속 오입력으로 60초간 잠금되었습니다.',
        remainingSec: afterFail.remainingSec
      });
    }
    return res.status(401).json({
      status: 'error',
      code: 'INVALID_CREDENTIALS',
      message: `PIN 번호가 올바르지 않습니다. (남은 시도 횟수: ${afterFail.attemptsRemaining}회)`,
      attemptsRemaining: afterFail.attemptsRemaining
    });
  }

  // Login successful: reset failed attempt counter
  authStore.recordSuccessfulLogin(clientIp);

  // If 2FA is enabled, issue temp token and request 2FA OTP code
  if (authStore.is2FAEnabled()) {
    const tempToken = authStore.createTemp2FAToken({ deviceName, rememberMe: !!rememberMe });
    return res.json({
      status: 'ok',
      require2FA: true,
      tempToken,
      message: 'Google 또는 Microsoft Authenticator 6자리 인증 코드를 입력해주세요.'
    });
  }

  // Generate trusted device session token stored in embedded vector DB
  const session = await authStore.createSession({ deviceName, rememberMe: !!rememberMe });
  const pinStatus = authStore.getPinStatus();

  res.json({
    status: 'ok',
    data: {
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
      user: session.user,
      isInitialPin: pinStatus.isInitialPin
    }
  });
});

/**
 * POST /api/security/2fa/verify-login
 * Complete 2-Step Login with Google / Microsoft Authenticator TOTP
 */
apiRouter.post('/security/2fa/verify-login', async (req, res) => {
  const { tempToken, code } = req.body || {};
  if (!tempToken || !code) {
    return res.status(400).json({ status: 'error', message: '임시 세션 토큰과 6자리 인증 코드를 입력해주세요.' });
  }

  const result = await authStore.verify2FALogin(tempToken, code);
  const session = result && (result.session || (result.sessionToken ? result : null));
  if (!session) {
    const errorCode = (result && result.code) || 'INVALID_2FA_CODE';
    const errorMsg = (result && result.message) || '인증 코드가 일치하지 않습니다. (Authenticator의 현재 6자리 번호를 확인하세요)';
    return res.status(401).json({
      status: 'error',
      code: errorCode,
      message: errorMsg
    });
  }

  res.json({
    status: 'ok',
    data: {
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
      user: session.user
    }
  });
});

/**
 * POST /api/security/2fa/setup
 * Generate QR code and secret for Google/Microsoft Authenticator
 */
apiRouter.post('/security/2fa/setup', async (req, res) => {
  if (authStore.is2FAEnabled()) return res.status(409).json({ status: 'error', message: '기존 OTP를 확인하여 해제한 뒤 다시 등록하세요.' });
  try {
    const setupData = await authStore.generate2FASetup('Admin', 'NexusPulse');
    res.json({
      status: 'ok',
      data: setupData
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/security/2fa/enable
 * Confirm and activate 2FA
 */
apiRouter.post('/security/2fa/enable', async (req, res) => {
  if (authStore.is2FAEnabled()) return res.status(409).json({ status: 'error', message: '기존 OTP를 확인하여 해제한 뒤 다시 등록하세요.' });
  const { secret, code, backupCodes } = req.body || {};
  if (!secret || !code) {
    return res.status(400).json({ status: 'error', message: '시크릿 키와 인증 코드를 입력해주세요.' });
  }

  try {
    authStore.enable2FA(secret, code, backupCodes || []);
    res.json({
      status: 'ok',
      message: 'Google / MS Authenticator 2단계 인증(2FA)이 활성화되었습니다.'
    });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/security/2fa/disable
 * Deactivate 2FA
 */
apiRouter.post('/security/2fa/disable', async (req, res) => {
  const { code } = req.body || {};
  try {
    authStore.disable2FA(code);
    res.json({
      status: 'ok',
      message: '2단계 인증(2FA)이 비활성화되었습니다.'
    });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/security/pin/change
 * Change Administrator PIN / Master Password
 */
apiRouter.post('/security/pin/change', async (req, res) => {
  const { currentPin, newPin } = req.body || {};

  if (!req.user?.isMaster) {
    if (!currentPin || !authStore.verifyPin(currentPin)) {
      return res.status(401).json({
        status: 'error',
        code: 'INVALID_CURRENT_PIN',
        message: '현재 PIN 번호가 일치하지 않습니다.'
      });
    }
  } else if (currentPin && !authStore.verifyPin(currentPin)) {
    return res.status(401).json({
      status: 'error',
      code: 'INVALID_CURRENT_PIN',
      message: '현재 PIN 번호가 일치하지 않습니다.'
    });
  }

  if (!newPin || typeof newPin !== 'string' || newPin.trim().length < 4) {
    return res.status(400).json({
      status: 'error',
      message: '새 PIN(비밀번호)은 최소 4자리 이상이어야 합니다.'
    });
  }

  try {
    await authStore.setPin(newPin);
    res.json({
      status: 'ok',
      message: 'PIN 번호가 성공적으로 변경되었습니다.'
    });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/security/logout
 * Revoke active session
 */
apiRouter.post('/security/logout', async (req, res) => {
  const token = proxyGateway.extractToken(req);
  if (token) {
    try {
      const cleanToken = authStore.normalizeToken(token);
      const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
      const cached = authStore.activeTokens.get(tokenHash);
      if (cached && !cached.isMaster) {
        await authStore.revokeToken(cached.id);
      }
    } catch (e) {}
  }
  res.json({ status: 'ok', message: '로그아웃 되었습니다.' });
});

apiRouter.post('/security/verify', proxyGateway.rateLimiter.middleware('sec_verify', 20, 60000), async (req, res) => {
  const { token, pin } = req.body || {};
  const candidate = token || pin;
  if (!candidate) {
    return res.status(400).json({ status: 'error', message: '토큰 또는 PIN을 입력해주세요.' });
  }
  const user = await authStore.validateToken(candidate);
  if (!user) {
    return res.status(401).json({ status: 'error', code: 'INVALID_TOKEN', message: '유효하지 않은 토큰 또는 PIN입니다.' });
  }
  res.json({
    status: 'ok',
    data: {
      valid: true,
      user: {
        name: user.name,
        role: user.role,
        isMaster: user.isMaster,
        createdAt: user.createdAt
      }
    }
  });
});

apiRouter.get('/security/tokens', (req, res) => {
  res.json({
    status: 'ok',
    data: authStore.listTokens()
  });
});

apiRouter.post('/security/tokens', proxyGateway.rateLimiter.middleware('sec_tokens', 10, 60000), async (req, res) => {
  const { name = 'API Client', role = 'admin', expiresInDays } = req.body || {};
  if (!['admin', 'operator', 'viewer'].includes(role)) return res.status(400).json({ status: 'error', message: '잘못된 권한입니다.' });
  const rawToken = crypto.randomBytes(24).toString('base64url');
  const expiresAt = expiresInDays ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000 : null;

  const result = await authStore.registerToken(rawToken, {
    name,
    role,
    isMaster: false,
    createdAt: Date.now(),
    expiresAt
  });

  res.status(201).json({
    status: 'ok',
    data: {
      id: result.id,
      token: rawToken,
      name: result.name,
      role: result.role,
      expiresAt: result.expiresAt
    }
  });
});

apiRouter.delete('/security/tokens/:id', async (req, res) => {
  try {
    const result = await authStore.revokeToken(req.params.id);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/system/overview
 * Static system specifications, hardware specs, OS & memory layout
 */
apiRouter.get('/system/overview', async (req, res) => {
  try {
    const overview = await telemetry.getStaticSpecs();
    res.json({
      status: 'ok',
      data: overview
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/system/metrics
 * Instantaneous real-time metric snapshot
 */
apiRouter.get('/system/metrics', async (req, res) => {
  try {
    const metrics = await telemetry.getMetrics();
    res.json({
      status: 'ok',
      data: metrics
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/system/history
 * Past 60 seconds rolling telemetry data points
 */
apiRouter.get('/system/history', (req, res) => {
  try {
    const history = telemetry.getHistory();
    res.json({
      status: 'ok',
      count: history.length,
      data: history
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/system/processes
 * Process list with sorting, filtering, and pagination
 * Query params: ?sort=cpu|mem|pid|name & limit=50 & search=...
 */
apiRouter.get('/system/processes', async (req, res) => {
  try {
    const { sort = 'cpu', limit = 50, search = '' } = req.query;
    const procData = await telemetry.getProcesses({ sort, limit, search });
    res.json({
      status: 'ok',
      data: procData
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/system/processes/kill
 * Terminate a process by PID with a signal (SIGTERM, SIGKILL, etc.)
 */
apiRouter.post('/system/processes/kill', proxyGateway.rateLimiter.middleware('proc_kill', 15, 60000), async (req, res) => {
  try {
    const { pid, signal = 'SIGTERM' } = req.body;
    if (!pid) {
      return res.status(400).json({ status: 'error', message: 'Missing required field: pid' });
    }

    const result = await telemetry.killProcess(pid, signal);
    res.json({
      status: 'ok',
      data: result
    });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/system/ports
 * Open listening network ports
 */
apiRouter.get('/system/ports', async (req, res) => {
  try {
    const ports = await telemetry.getOpenPorts();
    res.json({
      status: 'ok',
      count: ports.length,
      data: ports
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/benchmark/start
 * Launch a safe CPU/RAM stress benchmark
 */
apiRouter.post('/benchmark/start', proxyGateway.rateLimiter.middleware('benchmark', 10, 60000), (req, res) => {
  try {
    const { durationSec = 10, cpuCores, ramMb = 256 } = req.body || {};
    const result = telemetry.startBenchmark({ durationSec, cpuCores, ramMb });
    res.json({
      status: 'ok',
      data: result
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/benchmark/stop
 * Halt any active stress benchmark immediately
 */
apiRouter.post('/benchmark/stop', (req, res) => {
  try {
    const result = telemetry.stopBenchmark();
    res.json({
      status: 'ok',
      data: result
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/alerts
 * Active alerts, rule configuration, and alert history
 */
apiRouter.get('/alerts', (req, res) => {
  try {
    const alerts = telemetry.getAlerts();
    res.json({
      status: 'ok',
      data: alerts
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/alerts/config
 * Update alert threshold configuration
 */
apiRouter.post('/alerts/config', (req, res) => {
  try {
    const updated = telemetry.updateAlertRules(req.body);
    res.json({
      status: 'ok',
      data: updated
    });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/logs
 * Buffered system and server event logs
 */
apiRouter.get('/logs', (req, res) => {
  try {
    const { limit = 100, level, search } = req.query;
    const logs = telemetry.getLogs({
      limit: parseInt(limit, 10) || 100,
      level,
      search
    });
    res.json({
      status: 'ok',
      count: logs.length,
      data: logs
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/containers
 * Docker engine specs and active/all container metrics
 */
apiRouter.get('/containers', async (req, res) => {
  try {
    const data = await telemetry.getContainersOverview();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/containers/demo/deploy
 * Deploy sample testing container
 */
apiRouter.post('/containers/demo/deploy', async (req, res) => {
  try {
    const result = await telemetry.deployDemoContainer();
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/containers/:id/:action
 * Execute lifecycle action on container (start, stop, restart, pause, unpause, remove)
 */
apiRouter.post('/containers/:id/:action', async (req, res) => {
  try {
    const { id, action } = req.params;
    const result = await telemetry.containerAction(id, action);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * DELETE /api/containers/:id
 * Remove / Delete container (docker rm -f)
 */
apiRouter.delete('/containers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await telemetry.containerAction(id, 'remove');
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/containers/:id/logs
 * Retrieve latest container logs
 */
apiRouter.get('/containers/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { tail = 100 } = req.query;
    const result = await telemetry.getContainerLogs(id, tail);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/virtualization
 * Hypervisor type, bare-metal vs guest mode, hardware VT-x/AMD-V flags, and active VMs
 */
apiRouter.get('/virtualization', async (req, res) => {
  try {
    const data = await telemetry.getVirtualizationOverview();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/vms/:name/:action
 * Control Virtual Machine domain (start, shutdown, destroy, reboot, pause, resume, reset)
 */
apiRouter.post('/vms/:name/:action', async (req, res) => {
  try {
    const { name, action } = req.params;
    const result = await telemetry.vmAction(name, action);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

apiRouter.get('/downloads/status', (req, res) => {
  res.json({ status: 'ok', data: downloads.getStatus() });
});

apiRouter.post('/downloads/request', proxyGateway.rateLimiter.middleware('download_request', 10, 60000), async (req, res) => {
  try { res.json({ status: 'ok', data: await downloads.requestWithHermes(req.body?.prompt) }); }
  catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

apiRouter.put('/downloads/settings', (req, res) => {
  try { res.json({ status: 'ok', data: downloads.saveSettings(req.body || {}) }); }
  catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

apiRouter.get('/downloads/transmission', async (req, res) => {
  res.json({ status: 'ok', data: await downloads.getTransmission() });
});

apiRouter.post('/downloads/transmission', async (req, res) => {
  try { res.json({ status: 'ok', data: await downloads.addTorrent(req.body?.uri) }); }
  catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

apiRouter.post('/downloads/transmission/:id/:action', async (req, res) => {
  try { res.json({ status: 'ok', data: await downloads.torrentAction(req.params.id, req.params.action) }); }
  catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

apiRouter.get('/downloads/youtube', (req, res) => {
  res.json({ status: 'ok', data: downloads.listYoutubeJobs() });
});

apiRouter.post('/downloads/youtube', (req, res) => {
  try { res.status(202).json({ status: 'ok', data: downloads.startYoutube(req.body?.url, req.body?.quality) }); }
  catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

apiRouter.post('/downloads/youtube/failed/clear', (req, res) => {
  res.json({ status: 'ok', data: downloads.clearFailedYoutubeJobs() });
});

apiRouter.post('/downloads/youtube/failed/retry', (req, res) => {
  res.json({ status: 'ok', data: downloads.retryFailedYoutubeJobs() });
});

apiRouter.post('/downloads/youtube/:id/:action', (req, res) => {
  try { res.json({ status: 'ok', data: downloads.youtubeAction(req.params.id, req.params.action) }); }
  catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

// Mount API router
app.use('/api', apiRouter);

// Support /api/v1 prefix as alias for PRD compatibility
app.use('/api/v1', apiRouter);

// ==========================================
// Static File Serving & SPA Fallback
// ==========================================

const clientDistPath = path.resolve(__dirname, '../client/dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  // SPA fallback for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // If client isn't built yet, provide informative landing response
  app.get('/', (req, res) => {
    res.json({
      name: 'NexusPulse Core Telemetry Server',
      status: 'running',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        overview: '/api/system/overview',
        metrics: '/api/system/metrics',
        history: '/api/system/history',
        processes: '/api/system/processes',
        ports: '/api/system/ports',
        alerts: '/api/alerts',
        logs: '/api/logs',
        benchmarkStart: 'POST /api/benchmark/start',
        benchmarkStop: 'POST /api/benchmark/stop',
        websocket: 'ws://' + (req.headers.host || `localhost:${DEFAULT_PORT}`) + '/ws'
      }
    });
  });
}

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  });
});

// ==========================================
// HTTP & WebSocket Server Setup
// ==========================================

const server = http.createServer(app);

const wss = new WebSocketServer({
  noServer: true
});

const clients = new Set();

// Heartbeat tracking to detect and prune dead sockets
function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', async (ws, request) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  clients.add(ws);

  // Authenticate WebSocket connection via token query param or headers
  const authUser = request.authUser;
  ws.isAuthenticated = !!authUser;
  ws.user = authUser;
  ws.authRequest = request;

  const clientIp = request.socket.remoteAddress;
  telemetry.addLog('INFO', `WebSocket client connected from ${clientIp} [Auth: ${ws.isAuthenticated ? ws.user.name : 'Guest'}] (Active: ${clients.size})`, 'websocket');

  // Send initial welcome & full state message immediately
  (async () => {
    try {
      const [overview, metrics, containers, virt] = await Promise.all([
        telemetry.getStaticSpecs(),
        telemetry.getMetrics(),
        telemetry.getContainersOverview(),
        telemetry.getVirtualizationOverview()
      ]);
      const history = telemetry.getHistory();
      const alerts = telemetry.getAlerts();
      const logs = telemetry.getLogs({ limit: 100 });

      ws.send(JSON.stringify({
        type: 'init',
        authenticated: ws.isAuthenticated,
        user: ws.user ? { name: ws.user.name, role: ws.user.role, isMaster: ws.user.isMaster } : null,
        overview,
        metrics,
        data: metrics,
        history,
        alerts: alerts.active || [],
        rules: alerts.rules || {},
        logs: logs.logs || [],
        containers,
        virtualization: virt,
        timestamp: Date.now(),
        clientsCount: clients.size
      }));
    } catch (e) {
      console.warn('Error sending initial WS snapshot:', e.message);
    }
  })();

  // Handle client incoming messages & commands
  ws.on('message', async (rawMessage) => {
    try {
      const currentUser = await proxyGateway.authenticateWsRequest(request);
      if (!currentUser) { ws.close(1008, 'Login required'); return; }
      ws.user = currentUser;
      const msg = JSON.parse(rawMessage.toString());
      const cmdType = msg.type || msg.command || msg.action;

      // Check authentication for mutating commands
      const mutatingCommands = [
        'kill_process', 'start_benchmark', 'stop_benchmark',
        'container_action', 'deploy_demo_container', 'vm_action'
      ];

      if (mutatingCommands.includes(cmdType) && !['admin', 'operator'].includes(ws.user.role)) {
        ws.send(JSON.stringify({
          type: 'error',
          code: 401,
          message: '이 작업을 수행하려면 인증 토큰이 필요합니다. 대시보드 상단에서 인증 토큰을 등록해주세요.'
        }));
        return;
      }

      switch (cmdType) {
        case 'auth': {
          const token = msg.token || msg.payload?.token;
          const user = await authStore.validateToken(token);
          if (user) {
            ws.isAuthenticated = true;
            ws.user = user;
            ws.send(JSON.stringify({
              type: 'auth_success',
              user: { name: user.name, role: user.role, isMaster: user.isMaster }
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'auth_error',
              message: '인증 토큰이 올바르지 않습니다.'
            }));
          }
          break;
        }

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'request_containers': {
          const containers = await telemetry.getContainersOverview();
          ws.send(JSON.stringify({
            type: 'containers',
            timestamp: Date.now(),
            data: containers
          }));
          break;
        }

        case 'request_virtualization': {
          const virt = await telemetry.getVirtualizationOverview();
          ws.send(JSON.stringify({
            type: 'virtualization',
            timestamp: Date.now(),
            data: virt
          }));
          break;
        }

        case 'container_action': {
          try {
            const { id, action } = msg.payload || msg;
            const res = await telemetry.containerAction(id, action);
            ws.send(JSON.stringify({
              type: 'container_action_result',
              success: true,
              data: res
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'container_action_result',
              success: false,
              error: err.message
            }));
          }
          break;
        }

        case 'deploy_demo_container': {
          try {
            const res = await telemetry.deployDemoContainer();
            ws.send(JSON.stringify({
              type: 'deploy_demo_result',
              success: true,
              data: res
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'deploy_demo_result',
              success: false,
              error: err.message
            }));
          }
          break;
        }

        case 'vm_action': {
          try {
            const { name, action } = msg.payload || msg;
            const res = await telemetry.vmAction(name, action);
            ws.send(JSON.stringify({
              type: 'vm_action_result',
              success: true,
              data: res
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'vm_action_result',
              success: false,
              error: err.message
            }));
          }
          break;
        }

        case 'request_history':
          ws.send(JSON.stringify({
            type: 'history',
            timestamp: Date.now(),
            data: telemetry.getHistory()
          }));
          break;

        case 'request_processes': {
          const procs = await telemetry.getProcesses(msg.payload || msg);
          ws.send(JSON.stringify({
            type: 'processes',
            timestamp: Date.now(),
            data: procs
          }));
          break;
        }

        case 'kill_process': {
          try {
            const { pid, signal } = msg.payload || msg;
            const res = await telemetry.killProcess(pid, signal);
            ws.send(JSON.stringify({
              type: 'process_killed',
              success: true,
              data: res
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'process_killed',
              success: false,
              error: err.message
            }));
          }
          break;
        }

        case 'start_benchmark': {
          const res = telemetry.startBenchmark(msg.payload || msg);
          ws.send(JSON.stringify({
            type: 'benchmark_status',
            data: res
          }));
          break;
        }

        case 'stop_benchmark': {
          const res = telemetry.stopBenchmark();
          ws.send(JSON.stringify({
            type: 'benchmark_status',
            data: res
          }));
          break;
        }

        case 'request_logs': {
          const logs = telemetry.getLogs(msg.payload || msg);
          ws.send(JSON.stringify({
            type: 'logs',
            timestamp: Date.now(),
            data: logs
          }));
          break;
        }

        case 'request_ports': {
          const ports = await telemetry.getOpenPorts();
          ws.send(JSON.stringify({
            type: 'ports',
            timestamp: Date.now(),
            data: ports
          }));
          break;
        }

        case 'request_overview': {
          const overview = await telemetry.getStaticSpecs();
          ws.send(JSON.stringify({
            type: 'overview',
            timestamp: Date.now(),
            data: overview
          }));
          break;
        }

        case 'set_interval':
          // Acknowledge custom interval preference
          ws.send(JSON.stringify({
            type: 'interval_set',
            intervalMs: msg.intervalMs || 1000
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'unknown_command',
            received: cmdType
          }));
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format. JSON expected.'
      }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    telemetry.addLog('INFO', `WebSocket client disconnected (Active clients: ${clients.size})`, 'websocket');
  });

  ws.on('error', (err) => {
    console.warn('[WebSocket Error]:', err.message);
    clients.delete(ws);
  });
});

// Upgrade handler supporting /ws and root / with CSWSH protection
server.on('upgrade', async (request, socket, head) => {
  if (!proxyGateway.verifyWsUpgrade(request)) {
    console.warn(`[CSWSH Blocked] Disallowed WebSocket upgrade attempt from origin: ${request.headers.origin}`);
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  request.authUser = await proxyGateway.authenticateWsRequest(request);
  if (!request.authUser) {
    socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    return;
  }
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws' || pathname === '/ws/telemetry' || pathname === '/') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Periodic ping interval to prune dead connections
const pingInterval = setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) {
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// ==========================================
// Telemetry Live Broadcast Loop (1 Hz)
// ==========================================

let isBroadcasting = false;

const broadcastTicker = setInterval(async () => {
  if (isBroadcasting) return; // avoid overlapping ticks
  isBroadcasting = true;

  try {
    const snapshot = await telemetry.getMetrics();
    const alertsData = telemetry.getAlerts();

    if (clients.size > 0) {
      const payload = JSON.stringify({
        type: 'tick',
        timestamp: snapshot.timestamp,
        metrics: snapshot,
        alerts: alertsData.active,
        alertCount: alertsData.summary.total,
        benchmarkActive: snapshot.benchmarkActive,
        clientsCount: clients.size
      });

      for (const client of clients) {
        if (!await proxyGateway.authenticateWsRequest(client.authRequest)) { client.close(1008, 'Session expired'); continue; }
        if (client.user?.expiresAt && client.user.expiresAt <= Date.now()) { client.close(1008, 'Session expired'); continue; }
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(payload);
          } catch (e) {
            console.warn('[Broadcast Error to client]:', e.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Broadcast Ticker Error]:', err.message);
  } finally {
    isBroadcasting = false;
  }
}, 1000);

// ==========================================
// Graceful Shutdown Management
// ==========================================

function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
  telemetry.addLog('WARN', `Server shutting down via ${signal}...`, 'lifecycle');

  clearInterval(broadcastTicker);
  clearInterval(pingInterval);

  telemetry.stopBenchmark();

  // Close all WebSocket clients
  for (const client of clients) {
    try {
      client.close(1001, 'Server shutting down');
    } catch (e) {}
  }
  clients.clear();

  // Close HTTP server
  server.close(() => {
    console.log('[Server] HTTP and WebSocket servers successfully closed.');
    process.exit(0);
  });

  // Force close after 5 seconds
  setTimeout(() => {
    console.error('[Server] Forcefully terminating after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('[FATAL uncaughtException]:', err);
  telemetry.addLog('ERROR', `Uncaught Exception: ${err.message}`, 'lifecycle');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]:', reason);
});

// ==========================================
// Start Listening (if run directly)
// ==========================================

async function startServer(port = DEFAULT_PORT) {
  // Initialize embedded vector auth store
  await authStore.init();

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`
============================================================
  ⚡ NexusPulse Tier 2 Internal Backend Engine Started ⚡
============================================================
  • Bind Interface:  127.0.0.1 (Strict Loopback Isolation)
  • Internal Port:   ${port}
  • REST API Base:   http://127.0.0.1:${port}/api
  • WebSocket URL:   ws://127.0.0.1:${port}/ws
  • PID:             ${process.pid}
  • External Access: BLOCKED (Accessible only via Front Proxy)
============================================================
      `);
      if (process.send) {
        process.send({ type: 'ready', port });
      }
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer(DEFAULT_PORT);
}

module.exports = { app, server, telemetry, startServer };
