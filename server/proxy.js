/**
 * NexusPulse Tier 1 - Front-Facing Security Proxy Gateway
 * 
 * Responsibilities:
 * - Listens on 0.0.0.0:4500 (Public Interface)
 * - Strict Dynamic CORS Guard (LAN 192.168.*, Tailscale 100.*, Loopback)
 * - CSWSH (Cross-Site WebSocket Hijacking) Protection
 * - Sliding Window Rate Limiting (DDoS & Brute-force shield)
 * - Embedded Vector DB Token Authentication Guard
 * - High-speed Streaming Reverse Proxy to Tier 2 Backend (127.0.0.1:4501)
 * - Transparent WebSocket Upgrades to Internal Engine
 */

const http = require('http');
const { URL } = require('url');
const httpProxy = require('http-proxy');
const proxyGateway = require('./security/proxyGateway');
const authStore = proxyGateway.authStore;

const PUBLIC_PORT = parseInt(process.env.PORT, 10) || 4500;
let currentInternalPort = parseInt(process.env.INTERNAL_PORT, 10) || 4501;
let internalTarget = `http://127.0.0.1:${currentInternalPort}`;
let internalWsTarget = `ws://127.0.0.1:${currentInternalPort}`;

function setInternalPort(port) {
  currentInternalPort = port;
  internalTarget = `http://127.0.0.1:${port}`;
  internalWsTarget = `ws://127.0.0.1:${port}`;
}

// Create reverse proxy instance
const proxy = httpProxy.createProxyServer({
  ws: true,
  xfwd: true,
  changeOrigin: true
});

// Resilient proxy error handling (e.g. backend engine restarting)
proxy.on('error', (err, req, res) => {
  console.warn(`[Proxy Gateway Warning] Upstream backend unreachable (${err.message}).`);
  if (res && !res.headersSent && typeof res.writeHead === 'function') {
    res.writeHead(502, {
      'Content-Type': 'application/json',
      'Retry-After': '2'
    });
    res.end(JSON.stringify({
      status: 'error',
      code: 'BAD_GATEWAY',
      message: 'NexusPulse 내부 백엔드 엔진이 준비 중입니다. 잠시 후 다시 시도하세요.'
    }));
  }
});

/**
 * Extracts normalized route pathname from request
 */
function getPathname(req) {
  try {
    return new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  } catch (e) {
    return req.url.split('?')[0];
  }
}

/**
 * Primary HTTP Gateway Request Handler
 */
async function handleHttpRequest(req, res) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const ip = req.socket.remoteAddress;
  delete req.headers['x-forwarded-for'];
  delete req.headers['x-forwarded-host'];
  delete req.headers['x-forwarded-proto'];
  const pathname = getPathname(req);
  const authPathname = pathname.toLowerCase().replace(/^\/api\/v1(?=\/|$)/, '/api').replace(/\/+$/, '');
  const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);

  // 1. Dynamic CORS & Origin Validation
  if (origin) {
    if (proxyGateway.isOriginAllowed(origin, host)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Nexus-Token');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else {
      // Untrusted Cross-Origin Request Blocked
      console.warn(`[Proxy Security Guard] Blocked untrusted cross-origin request from: ${origin} (IP: ${ip})`);
      if (req.method === 'OPTIONS' || isMutating) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          status: 'error',
          code: 'FORBIDDEN_ORIGIN',
          message: '허용되지 않은 Cross-Origin 요청입니다.'
        }));
      }
    }
  }

  // Preflight OPTIONS fast response
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // 2. Sliding Window Rate Limiting
  const globalCheck = proxyGateway.rateLimiter.check(`global:${ip}`, 300, 60000);
  if (!globalCheck.allowed) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': Math.ceil(globalCheck.resetInMs / 1000)
    });
    return res.end(JSON.stringify({
      status: 'error',
      code: 'RATE_LIMITED',
      message: '요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.'
    }));
  }

  // Rate limiting for sensitive operations
  if (authPathname.includes('/benchmark/')) {
    const check = proxyGateway.rateLimiter.check(`bench:${ip}`, 10, 60000);
    if (!check.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(check.resetInMs / 1000) });
      return res.end(JSON.stringify({ status: 'error', code: 'RATE_LIMITED', message: '벤치마크 실행 빈도 한도 초과' }));
    }
  } else if (authPathname.includes('/processes/kill')) {
    const check = proxyGateway.rateLimiter.check(`kill:${ip}`, 15, 60000);
    if (!check.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(check.resetInMs / 1000) });
      return res.end(JSON.stringify({ status: 'error', code: 'RATE_LIMITED', message: '프로세스 종료 빈도 한도 초과' }));
    }
  } else if (authPathname.includes('/security/login')) {
    const check = proxyGateway.rateLimiter.check(`sec_login:${ip}`, 15, 60000);
    if (!check.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(check.resetInMs / 1000) });
      return res.end(JSON.stringify({ status: 'error', code: 'RATE_LIMITED', message: '로그인 시도 한도 초과' }));
    }
  } else if (authPathname.includes('/security/verify')) {
    const check = proxyGateway.rateLimiter.check(`sec_verify:${ip}`, 20, 60000);
    if (!check.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(check.resetInMs / 1000) });
      return res.end(JSON.stringify({ status: 'error', code: 'RATE_LIMITED', message: '토큰 검증 시도 한도 초과' }));
    }
  }

  // 3. Token Authentication Guard (Perimeter Defense)
  const isApi = authPathname.startsWith('/api');
  const isPublicSecurityEndpoint = 
    authPathname === '/api/health' ||
    authPathname === '/api/security/status' || 
    authPathname === '/api/security/login' || 
    authPathname === '/api/security/verify' ||
    authPathname === '/api/security/2fa/verify-login';
  const isSecurityAdmin = authPathname.startsWith('/api/security') && !isPublicSecurityEndpoint;
  const requireAuthForReadOnly = process.env.REQUIRE_AUTH_READONLY !== 'false';

  if (isApi) {
    // Whitelisted public API endpoints
    if (isPublicSecurityEndpoint) {
      // Forward directly to backend
      return proxy.web(req, res, { target: internalTarget });
    }

    if (isMutating || isSecurityAdmin || requireAuthForReadOnly) {
      const token = proxyGateway.extractToken(req);
      const user = token ? await authStore.validateToken(token) : null;

      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          status: 'error',
          code: 'UNAUTHORIZED',
          message: '인증 토큰이 필요합니다. 헤더(Authorization: Bearer <token>) 또는 토큰 등록을 확인하세요.'
        }));
      }

      // Attach verified user metadata to forwarded headers
      req.headers['x-nexus-user-role'] = user.role;
      req.headers['x-nexus-user-master'] = String(user.isMaster);
      req.headers['x-nexus-user-name'] = encodeURIComponent(user.name);
    }
  }

  // 4. Forward clean, authorized request to Internal Backend Engine
  proxy.web(req, res, { target: internalTarget });
}

// Create HTTP Server for Proxy Gateway
const proxyServer = http.createServer(handleHttpRequest);

// WebSocket Upgrade Handler with CSWSH protection
proxyServer.on('upgrade', (request, socket, head) => {
  delete request.headers['x-forwarded-for'];
  if (!proxyGateway.verifyWsUpgrade(request)) {
    console.warn(`[Proxy Gateway CSWSH Blocked] Disallowed WebSocket upgrade attempt from origin: ${request.headers.origin}`);
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  // Forward WebSocket connection to Tier 2 Backend
  proxy.ws(request, socket, head, { target: internalWsTarget });
});

async function startProxyServer(port = PUBLIC_PORT, backendPort = null) {
  if (backendPort) {
    setInternalPort(backendPort);
  }
  await authStore.init();

  return new Promise((resolve) => {
    proxyServer.listen(port, '0.0.0.0', () => {
      console.log(`
============================================================
  🛡️ NexusPulse Tier 1 Security Proxy Gateway Started 🛡️
============================================================
  • Public Port:     ${port} (0.0.0.0)
  • Internal Target: ${internalTarget}
  • Dynamic CORS:    Active (LAN + Tailscale + Loopback)
  • CSWSH Guard:     Active (Strict Origin Upgrade Filter)
  • Vector Auth DB:  Active (Vectra Embedded 64-Dim Cosine)
  • PID:             ${process.pid}
============================================================
      `);
      resolve(proxyServer);
    });
  });
}

function closeProxyServer() {
  return new Promise((resolve) => {
    proxy.close();
    proxyServer.close(() => {
      resolve();
    });
  });
}

if (require.main === module) {
  startProxyServer(PUBLIC_PORT);
}

module.exports = {
  proxyServer,
  startProxyServer,
  closeProxyServer,
  setInternalPort,
  proxy
};
