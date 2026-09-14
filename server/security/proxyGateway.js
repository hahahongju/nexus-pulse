/**
 * NexusPulse Security Proxy & Gateway Middleware
 * 
 * Features:
 * - Dynamic Strict CORS & CSWSH (Cross-Site WebSocket Hijacking) Origin Guard
 *   (Permits loopback, RFC1918 Private LAN, Tailscale CGNAT 100.* & *.ts.net, blocks malicious web origins)
 * - In-Memory Sliding Window Rate Limiting (DDoS & Brute-force protection)
 * - Token Authentication Guard backed by Embedded Vector DB (vectra)
 * - Public Read-Only Telemetry with Locked Mutating Operations
 * - Token Management Endpoints for Master Admin
 */

const { URL } = require('url');
const authStore = require('./authStore');

// ==========================================
// 1. Origin & CSWSH Protection
// ==========================================

/**
 * Checks if a given Origin header is trusted.
 * Allows:
 * - Empty origin (same-origin navigation, curl, direct HTTP)
 * - Loopback (localhost, 127.0.0.1, ::1, 0.0.0.0)
 * - Private LAN (192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12)
 * - Tailscale CGNAT (100.64.0.0/10, 100.*.*.*, *.ts.net)
 * - Local mDNS (*.local)
 * - Same-Origin match with Host header
 * - Custom whitelist via process.env.ALLOWED_ORIGINS
 */
function isOriginAllowed(originStr, hostHeader) {
  if (!originStr) return true; // Direct/CLI/same-origin navigation

  let url;
  try {
    url = new URL(originStr);
  } catch (e) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  // Same-origin check with Host header
  if (hostHeader) {
    const cleanHost = hostHeader.split(':')[0].toLowerCase();
    if (hostname === cleanHost) return true;
  }

  // Loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
    return true;
  }

  // Private LAN
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;

  // Tailscale IP & MagicDNS
  if (/^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (hostname.endsWith('.ts.net')) return true;

  // Local mDNS
  if (hostname.endsWith('.local')) return true;

  // Custom Whitelist via env
  if (process.env.ALLOWED_ORIGINS) {
    const allowed = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim().toLowerCase());
    if (allowed.includes(originStr.toLowerCase()) || allowed.includes(hostname)) {
      return true;
    }
  }

  return false;
}

/**
 * Express CORS Middleware replacing generic cors('*')
 */
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const host = req.headers.host;

  if (origin) {
    if (isOriginAllowed(origin, host)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Nexus-Token');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else {
      // Disallowed cross-origin request
      if (req.method === 'OPTIONS') {
        return res.status(403).json({
          status: 'error',
          code: 'FORBIDDEN_ORIGIN',
          message: 'Cross-Origin 요청이 거부되었습니다.'
        });
      }
      // Mutating cross-origin requests from untrusted web pages are immediately rejected
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return res.status(403).json({
          status: 'error',
          code: 'FORBIDDEN_ORIGIN',
          message: '허용되지 않은 Cross-Origin 요청입니다.'
        });
      }
    }
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

/**
 * WebSocket upgrade validator to prevent CSWSH
 */
function verifyWsUpgrade(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  return isOriginAllowed(origin, host);
}

// ==========================================
// 2. Sliding Window Rate Limiter
// ==========================================

class RateLimiter {
  constructor() {
    this.buckets = new Map(); // key -> { count, resetAt }
    // Clean up expired buckets every 2 minutes
    setInterval(() => this.cleanup(), 2 * 60 * 1000).unref();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.buckets.entries()) {
      if (now > record.resetAt) {
        this.buckets.delete(key);
      }
    }
  }

  check(key, limit, windowMs = 60000) {
    const now = Date.now();
    let record = this.buckets.get(key);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, record);
      return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
    }

    record.count++;
    if (record.count > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetInMs: Math.max(0, record.resetAt - now)
      };
    }

    return {
      allowed: true,
      remaining: limit - record.count,
      resetInMs: Math.max(0, record.resetAt - now)
    };
  }

  middleware(bucketName, limit, windowMs = 60000) {
    return (req, res, next) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `${bucketName}:${ip}`;
      const result = this.check(key, limit, windowMs);

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);

      if (!result.allowed) {
        res.setHeader('Retry-After', Math.ceil(result.resetInMs / 1000));
        return res.status(429).json({
          status: 'error',
          code: 'RATE_LIMITED',
          message: '요청 빈도 한도를 초과했습니다. 잠시 후 다시 시도하세요.',
          retryAfterSec: Math.ceil(result.resetInMs / 1000)
        });
      }

      next();
    };
  }
}

const rateLimiter = new RateLimiter();

// ==========================================
// 3. Token Authentication Middleware
// ==========================================

function extractToken(req) {
  // 1. Authorization header: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  // 2. Custom header: X-Nexus-Token
  if (req.headers['x-nexus-token']) {
    return String(req.headers['x-nexus-token']).trim();
  }
  // 3. Query param: ?token=...
  if (req.query && req.query.token) {
    return String(req.query.token).trim();
  }
  return null;
}

/**
 * Resolves token from request and attaches req.user
 */
async function resolveAuth(req) {
  const rawToken = extractToken(req);
  if (!rawToken) return null;

  try {
    const user = await authStore.validateToken(rawToken);
    return user;
  } catch (e) {
    return null;
  }
}

/**
 * Main Authentication & Access Control Middleware
 * - All GET requests are read-only public by default (unless REQUIRE_AUTH_READONLY=true)
 * - All POST, PUT, DELETE requests require a valid token
 * - /api/security/* routes require valid token
 */
function authGuard(options = {}) {
  const requireAuthForReadOnly = process.env.REQUIRE_AUTH_READONLY !== 'false';

  return async (req, res, next) => {
    // Attach auth user if available
    req.user = await resolveAuth(req);

    // Whitelisted public endpoints
    const authPath = req.path.toLowerCase().replace(/^\/api\/v1(?=\/|$)/, '/api').replace(/\/+$/, '');
    const isPublicSecurityEndpoint = 
      authPath === '/api/health' || 
      authPath === '/api/security/status' || 
      authPath === '/api/security/login' || 
      authPath === '/api/security/verify' ||
      authPath === '/api/security/2fa/verify-login';

    if (isPublicSecurityEndpoint) {
      return next();
    }

    const isApi = authPath.startsWith('/api');
    if (!isApi) {
      return next(); // Static frontend assets & client-side routes
    }

    const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
    const isSecurityAdmin = authPath.startsWith('/api/security') && !isPublicSecurityEndpoint;

    if (isMutating || isSecurityAdmin || requireAuthForReadOnly) {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          code: 'UNAUTHORIZED',
          message: '인증 토큰이 필요합니다. 헤더(Authorization: Bearer <token>) 또는 토큰 등록을 확인하세요.'
        });
      }
      if ((isSecurityAdmin && authPath !== '/api/security/logout' && req.user.role !== 'admin') ||
          (isMutating && !isSecurityAdmin && !['admin', 'operator'].includes(req.user.role))) {
        return res.status(403).json({ status: 'error', message: '이 작업을 수행할 권한이 없습니다.' });
      }
    }

    next();
  };
}

/**
 * WebSocket Token Authenticator
 */
async function authenticateWsRequest(request) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token') || 
                  (request.headers.authorization && request.headers.authorization.replace(/^Bearer\s+/i, '')) ||
                  request.headers['x-nexus-token'];

    if (!token) return null;
    return await authStore.validateToken(token);
  } catch (e) {
    return null;
  }
}

module.exports = {
  isOriginAllowed,
  corsMiddleware,
  verifyWsUpgrade,
  rateLimiter,
  extractToken,
  resolveAuth,
  authGuard,
  authenticateWsRequest,
  authStore
};
