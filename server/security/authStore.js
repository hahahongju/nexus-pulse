const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { LocalIndex } = require('vectra');

const DATA_DIR = process.env.NEXUSPULSE_CONFIG_DIR || path.join(__dirname, '..', '..', 'data');
const SECURITY_DIR = path.join(DATA_DIR, 'security');
const INDEX_DIR = path.join(SECURITY_DIR, 'auth-index');
const TOKEN_FILE = path.join(SECURITY_DIR, 'admin-token.env');
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function isTokenExpired(token, now = Date.now()) {
  if (!token) return true;
  const configuredExpiry = token.expiresAt || Infinity;
  const sessionExpiry = token.kind === 'session' && token.createdAt
    ? token.createdAt + SESSION_TTL_MS
    : Infinity;
  return now > Math.min(configuredExpiry, sessionExpiry);
}

// 64-dimensional deterministic feature vector generator from token hash
function hashToVector(str, dim = 64) {
  const hash = crypto.createHash('sha512').update(str).digest();
  const vector = new Array(dim);
  for (let i = 0; i < dim; i++) {
    // Normalize byte to [-1, 1] range
    vector[i] = (hash[i % hash.length] - 128) / 128;
  }
  // L2 normalize
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map(v => v / norm);
}

function normalizeToken(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();
  str = str.replace(/^Bearer\s+/i, '').trim();
  str = str.replace(/^(?:NEXUS_)?(?:ADMIN_)?TOKEN\s*[:=]\s*/i, '').trim();
  str = str.replace(/^["'`]|["'`]$/g, '').trim();
  return str;
}

const QRCode = require('qrcode');

// RFC 4648 Base32 implementation for Google Authenticator & Microsoft Authenticator
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str) {
  str = String(str).toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const idx = BASE32_CHARS.indexOf(str[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// RFC 6238 Time-based One-Time Password (TOTP) Algorithm
function generateTOTP(secret, timeStep = 30, time = Date.now()) {
  const counter = Math.floor(time / 1000 / timeStep);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) |
               ((hmac[offset + 1] & 0xff) << 16) |
               ((hmac[offset + 2] & 0xff) << 8) |
               (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyTOTP(token, secret, window = 2) {
  if (!token || !secret) return false;
  token = String(token).trim().replace(/[\s-]/g, '');
  if (token.length !== 6) return false;
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const time = (currentStep + errorWindow) * 30 * 1000;
    if (generateTOTP(secret, 30, time) === token) return true;
  }
  return false;
}

class AuthStore {
  constructor() {
    this.index = null;
    this.initialized = false;
    this.activeTokens = new Map(); // tokenHash -> metadata
    this.loginAttempts = new Map(); // ip -> { count, lockedUntil }
    this.temp2FATokens = new Map(); // tempToken -> { expiresAt, rememberMe, deviceName }
  }

  normalizeToken(raw) {
    return normalizeToken(raw);
  }

  getPinConfig() {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const content = fs.readFileSync(TOKEN_FILE, 'utf8');
        const hashMatch = content.match(/NEXUS_ADMIN_PIN_HASH=([a-fA-F0-9]+)/);
        const saltMatch = content.match(/NEXUS_ADMIN_PIN_SALT=([a-fA-F0-9]+)/);
        if (hashMatch && saltMatch) {
          return { hash: hashMatch[1], salt: saltMatch[1], isInitial: false };
        }
        const plainPinMatch = content.match(/NEXUS_ADMIN_PIN=([^\r\n]+)/);
        if (plainPinMatch) {
          return { plain: plainPinMatch[1].trim(), isInitial: false };
        }
      }
    } catch (e) {}
    // Fail closed if the credential file is missing or unreadable.
    return { plain: null, isInitial: true };
  }

  getPinStatus() {
    const config = this.getPinConfig();
    return {
      isConfigured: true,
      isInitialPin: config.isInitial,
      defaultPinHint: config.isInitial ? '1234' : null,
      twoFactorEnabled: this.is2FAEnabled()
    };
  }

  get2FAConfig() {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const content = fs.readFileSync(TOKEN_FILE, 'utf8');
        const enabledMatch = content.match(/NEXUS_2FA_ENABLED=(true|false)/i);
        const secretMatch = content.match(/NEXUS_2FA_SECRET=([^\r\n]+)/i);
        const backupMatch = content.match(/NEXUS_2FA_BACKUP_CODES=([^\r\n]+)/i);
        const enabled = enabledMatch ? enabledMatch[1].toLowerCase() === 'true' : false;
        const secret = secretMatch ? secretMatch[1].trim().replace(/['"]/g, '') : null;
        const backupCodes = backupMatch ? backupMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [];
        return { enabled, secret, backupCodes, unavailable: enabled && (!secret || !/^[A-Z2-7]{32}$/.test(secret)) };
      }
    } catch (e) {}
    return { enabled: false, secret: null, backupCodes: [], unavailable: true };
  }

  is2FAEnabled() {
    const config = this.get2FAConfig();
    return !!(config.enabled && config.secret);
  }

  async generate2FASetup(username = 'admin', issuer = 'NexusPulse') {
    const secret = base32Encode(crypto.randomBytes(20));
    const backupCodes = Array.from({ length: 8 }).map(() => {
      return `${crypto.randomInt(1000, 9999)}-${crypto.randomInt(1000, 9999)}`;
    });
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      margin: 2,
      width: 240,
      color: { dark: '#000000', light: '#ffffff' }
    });

    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl,
      backupCodes
    };
  }

  generateTOTP(secret, timeStep = 30, time = Date.now()) {
    return generateTOTP(secret, timeStep, time);
  }

  verifyTOTP(token, secret, window = 2) {
    return verifyTOTP(token, secret, window);
  }

  enable2FA(secret, verificationCode, backupCodes = []) {
    if (this.is2FAEnabled()) throw new Error('기존 OTP를 해제한 뒤 다시 등록하세요.');
    if (typeof secret !== 'string' || !/^[A-Z2-7]{32}$/.test(secret) || !Array.isArray(backupCodes) || backupCodes.length !== 8 || !backupCodes.every(code => /^\d{4}-\d{4}$/.test(code))) throw new Error('잘못된 OTP 등록 정보입니다.');
    const cleanCode = String(verificationCode || '').trim().replace(/[\s-]/g, '');
    if (!verifyTOTP(cleanCode, secret, 2)) {
      throw new Error('인증 코드가 일치하지 않습니다. Google/MS Authenticator의 현재 6자리 번호를 정확히 입력해주세요.');
    }

    let content = '';
    if (fs.existsSync(TOKEN_FILE)) {
      content = fs.readFileSync(TOKEN_FILE, 'utf8');
    }
    content = content.replace(/NEXUS_2FA_ENABLED=.*(\r?\n|$)/g, '');
    content = content.replace(/NEXUS_2FA_SECRET=.*(\r?\n|$)/g, '');
    content = content.replace(/NEXUS_2FA_BACKUP_CODES=.*(\r?\n|$)/g, '');

    content = content.trimEnd() + `\nNEXUS_2FA_ENABLED=true\nNEXUS_2FA_SECRET=${secret}\nNEXUS_2FA_BACKUP_CODES=${backupCodes.join(',')}\n`;
    fs.writeFileSync(TOKEN_FILE, content, { mode: 0o600 });
    return { success: true };
  }

  disable2FA(code) {
    const config = this.get2FAConfig();
    if (!config.enabled) return { success: true };

    const clean = String(code || '').trim().replace(/[\s-]/g, '');
    let isValid = false;
    if (config.secret && verifyTOTP(clean, config.secret, 2)) {
      isValid = true;
    } else if (config.backupCodes && config.backupCodes.length > 0) {
      const normalizedBackup = config.backupCodes.map(b => String(b).replace(/[\s-]/g, ''));
      if (normalizedBackup.includes(clean)) {
        isValid = true;
      }
    }

    if (!isValid) {
      throw new Error('인증 코드 또는 복구 코드가 올바르지 않습니다.');
    }

    let content = '';
    if (fs.existsSync(TOKEN_FILE)) {
      content = fs.readFileSync(TOKEN_FILE, 'utf8');
    }
    content = content.replace(/NEXUS_2FA_ENABLED=.*(\r?\n|$)/g, '');
    content = content.replace(/NEXUS_2FA_SECRET=.*(\r?\n|$)/g, '');
    content = content.replace(/NEXUS_2FA_BACKUP_CODES=.*(\r?\n|$)/g, '');
    fs.writeFileSync(TOKEN_FILE, content, { mode: 0o600 });
    return { success: true };
  }

  createTemp2FAToken(metadata = {}) {
    const tempToken = 'temp2fa_' + crypto.randomBytes(24).toString('base64url');
    this.temp2FATokens.set(tempToken, {
      ...metadata,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes validity
    });
    return tempToken;
  }

  async verify2FALogin(tempToken, code) {
    if (!tempToken) {
      return { success: false, code: 'INVALID_TEMP_TOKEN', message: '임시 세션 토큰이 유효하지 않습니다.' };
    }
    const sessionMeta = this.temp2FATokens.get(tempToken);
    if (!sessionMeta) {
      return { success: false, code: 'SESSION_EXPIRED', message: '인증 세션이 만료되었거나 서버가 재시작되었습니다. PIN을 다시 입력해주세요.' };
    }
    sessionMeta.attempts = (sessionMeta.attempts || 0) + 1;
    if (sessionMeta.attempts > 5) {
      this.temp2FATokens.delete(tempToken);
      return { success: false, code: 'SESSION_EXPIRED', message: '인증 시도 횟수를 초과했습니다. 다시 로그인하세요.' };
    }
    if (Date.now() > sessionMeta.expiresAt) {
      this.temp2FATokens.delete(tempToken);
      return { success: false, code: 'SESSION_EXPIRED', message: '2FA 인증 유효 시간(5분)이 초과되었습니다. 다시 로그인해주세요.' };
    }

    const config = this.get2FAConfig();
    if (config.unavailable || !config.enabled || !config.secret) {
      this.temp2FATokens.delete(tempToken);
      return { success: false, code: 'OTP_UNAVAILABLE', message: 'OTP 설정을 확인할 수 없습니다. 다시 로그인하거나 서버 설정을 확인하세요.' };
    }

    const cleanCode = String(code || '').trim().replace(/[\s-]/g, '');
    let isTotpValid = verifyTOTP(cleanCode, config.secret, 2);
    if (isTotpValid) {
      // Persist the accepted counter before yielding, including across restarts.
      const replayFile = path.join(SECURITY_DIR, 'otp-counter.json');
      const secretHash = crypto.createHash('sha256').update(config.secret).digest('hex');
      let previous = { secretHash, step: -1 };
      if (fs.existsSync(replayFile)) previous = JSON.parse(fs.readFileSync(replayFile, 'utf8'));
      const current = Math.floor(Date.now() / 30000);
      const steps = [-2, -1, 0, 1, 2].map(offset => current + offset);
      const step = steps.find(candidate => generateTOTP(config.secret, 30, candidate * 30000) === cleanCode);
      if (previous.secretHash === secretHash && (!Number.isSafeInteger(previous.step) || step <= previous.step)) {
        return { success: false, code: 'REPLAYED_2FA_CODE', message: '이미 사용한 OTP입니다. Authenticator의 다음 번호를 입력하세요.' };
      }
      fs.writeFileSync(`${replayFile}.tmp`, JSON.stringify({ secretHash, step }), { mode: 0o600 });
      fs.renameSync(`${replayFile}.tmp`, replayFile);
    }

    if (!isTotpValid) {
      const backupList = config.backupCodes || [];
      const normalizedBackup = backupList.map(b => String(b).replace(/[\s-]/g, ''));
      const idx = normalizedBackup.indexOf(cleanCode);
      if (idx !== -1) {
        isTotpValid = true;
        const remainingCodes = backupList.filter((_, i) => i !== idx);
        let content = fs.readFileSync(TOKEN_FILE, 'utf8');
        content = content.replace(/NEXUS_2FA_BACKUP_CODES=.*(\r?\n|$)/g, '');
        content = content.trimEnd() + `\nNEXUS_2FA_BACKUP_CODES=${remainingCodes.join(',')}\n`;
        fs.writeFileSync(TOKEN_FILE, content, { mode: 0o600 });
      }
    }

    if (!isTotpValid) {
      return { 
        success: false, 
        code: 'INVALID_2FA_CODE', 
        message: '인증 코드가 일치하지 않습니다. Authenticator 앱의 현재 6자리 번호를 확인하세요.' 
      };
    }

    this.temp2FATokens.delete(tempToken);
    const session = await this.createSession(sessionMeta);
    return { success: true, session, ...session };
  }

  verifyPin(candidate) {
    if (!candidate || typeof candidate !== 'string') return false;
    const clean = candidate.trim();
    if (!clean) return false;

    // Also accept Master Token as valid authentication
    const masterToken = this.getMasterToken();
    if (masterToken && (clean === masterToken || normalizeToken(clean) === masterToken)) {
      return true;
    }

    const config = this.getPinConfig();
    if (config.hash && config.salt) {
      try {
        const candidateHash = crypto.pbkdf2Sync(clean, config.salt, 100000, 64, 'sha512').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(config.hash, 'hex'));
      } catch (e) {
        return false;
      }
    } else if (config.plain) {
      return clean === config.plain;
    }
    return false;
  }

  async setPin(newPin) {
    if (!newPin || typeof newPin !== 'string' || newPin.trim().length < 4) {
      throw new Error('PIN(비밀번호)은 최소 4자리 이상이어야 합니다.');
    }
    const clean = newPin.trim();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(clean, salt, 100000, 64, 'sha512').toString('hex');
    const revoked = [];
    await this.hydrateFromIndex();
    for (const [tokenHash, token] of this.activeTokens.entries()) {
      if (token.kind === 'session' || (!token.kind && !token.isMaster)) {
        token.expiresAt = Date.now() - 1;
        revoked.push(token.id);
        this.activeTokens.delete(tokenHash);
      }
    }
    for (const id of revoked) await this.index.deleteItem(id);
    this.temp2FATokens.clear();

    let content = '';
    if (fs.existsSync(TOKEN_FILE)) {
      content = fs.readFileSync(TOKEN_FILE, 'utf8');
    }
    content = content.replace(/NEXUS_ADMIN_PIN_HASH=.*(\r?\n|$)/g, '');
    content = content.replace(/NEXUS_ADMIN_PIN_SALT=.*(\r?\n|$)/g, '');
    content = content.replace(/NEXUS_ADMIN_PIN=.*(\r?\n|$)/g, '');
    content = content.trimEnd() + `\nNEXUS_ADMIN_PIN_HASH=${hash}\nNEXUS_ADMIN_PIN_SALT=${salt}\n`;
    fs.writeFileSync(TOKEN_FILE, content, { mode: 0o600 });
    return { success: true };
  }

  async createSession({ deviceName = 'Browser Client' } = {}) {
    if (!this.initialized) await this.init();
    const rawToken = 'sess_' + crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_TTL_MS;

    const record = await this.registerToken(rawToken, {
      name: deviceName,
      role: 'admin',
      isMaster: false,
      kind: 'session',
      createdAt: Date.now(),
      expiresAt
    });

    return {
      sessionToken: rawToken,
      expiresAt,
      user: {
        name: record.name,
        role: record.role,
        isMaster: record.isMaster,
        expiresAt
      }
    };
  }

  checkLockout(ip) {
    const record = this.loginAttempts.get(ip);
    if (!record) return { locked: false, remainingSec: 0, attemptsRemaining: 5 };
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
      return { locked: true, remainingSec, attemptsRemaining: 0 };
    }
    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
      this.loginAttempts.delete(ip);
      return { locked: false, remainingSec: 0, attemptsRemaining: 5 };
    }
    return { locked: false, remainingSec: 0, attemptsRemaining: Math.max(0, 5 - record.count) };
  }

  recordFailedLogin(ip) {
    let record = this.loginAttempts.get(ip);
    if (!record) {
      record = { count: 0, firstAttempt: Date.now(), lockedUntil: null };
      this.loginAttempts.set(ip, record);
    }
    record.count++;
    if (record.count >= 5) {
      record.lockedUntil = Date.now() + 60000; // Lock for 60 seconds
    }
    return this.checkLockout(ip);
  }

  recordSuccessfulLogin(ip) {
    this.loginAttempts.delete(ip);
  }

  async init() {
    if (this.initialized) return;

    if (!fs.existsSync(SECURITY_DIR)) {
      fs.mkdirSync(SECURITY_DIR, { recursive: true, mode: 0o700 });
    }

    this.index = new LocalIndex(INDEX_DIR);
    if (!fs.existsSync(path.join(INDEX_DIR, 'index.json'))) {
      await this.index.createIndex();
    }

    // Load active tokens into memory cache
    await this.hydrateFromIndex();

    // Ensure at least one master admin token exists
    if (this.activeTokens.size === 0) {
      await this.bootstrapDefaultToken();
    }

    this.initialized = true;
  }

  async hydrateFromIndex() {
    try {
      this.activeTokens.clear();
      this.index = new LocalIndex(INDEX_DIR);
      const items = await this.index.listItems();
      for (const item of items) {
        if (item.metadata?.tokenHash) {
          this.activeTokens.set(item.metadata.tokenHash, {
            id: item.id,
            ...item.metadata,
          });
        }
      }
    } catch (e) {
      // Clean fallback if index was just initialized
      this.activeTokens.clear();
    }
  }

  async bootstrapDefaultToken() {
    let existingToken = '';
    if (fs.existsSync(TOKEN_FILE)) {
      try {
        const content = fs.readFileSync(TOKEN_FILE, 'utf8');
        const match = content.match(/NEXUS_ADMIN_TOKEN=([a-zA-Z0-9_-]+)/);
        if (match) existingToken = match[1];
      } catch (e) {}
    }

    const token = existingToken || crypto.randomBytes(24).toString('base64url');
    await this.registerToken(token, {
      name: 'Default Master Administrator',
      role: 'admin',
      isMaster: true,
      createdAt: Date.now(),
      expiresAt: null
    });

    if (!existingToken) {
      fs.writeFileSync(TOKEN_FILE, `# NexusPulse Auto-Generated Master Authentication Token\nNEXUS_ADMIN_TOKEN=${token}\n`, { mode: 0o600 });
      console.log('=================================================================');
      console.log('  🔒 NexusPulse Security: Master Auth Token Generated');
      console.log(`  📁 Saved to: ${TOKEN_FILE}`);
      console.log('=================================================================');
    }
  }

  async registerToken(rawToken, metadata = {}) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const vector = hashToVector(tokenHash, 64);
    const id = `tok-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const record = {
      name: metadata.name || 'API Client',
      role: metadata.role || 'admin',
      tokenHash,
      kind: metadata.kind || 'api',
      isMaster: !!metadata.isMaster,
      createdAt: metadata.createdAt || Date.now(),
      expiresAt: metadata.expiresAt || null,
      lastUsedAt: Date.now()
    };

    await this.index.insertItem({
      id,
      vector,
      metadata: record
    });

    this.activeTokens.set(tokenHash, { id, ...record });
    return { id, token: rawToken, ...record };
  }

  async validateToken(rawToken) {
    if (!this.initialized) await this.init();
    if (!rawToken || typeof rawToken !== 'string') return null;

    const cleanToken = normalizeToken(rawToken);
    if (!cleanToken) return null;
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

    // Fast path: Master token from env file
    const masterToken = this.getMasterToken();
    if (masterToken && cleanToken === masterToken) {
      let masterRec = Array.from(this.activeTokens.values()).find(t => t.isMaster);
      if (!masterRec) {
        masterRec = {
          id: 'master',
          name: 'Default Master Administrator',
          role: 'admin',
          isMaster: true,
          tokenHash,
          createdAt: Date.now(),
          expiresAt: null,
          lastUsedAt: Date.now()
        };
        this.activeTokens.set(tokenHash, masterRec);
      }
      masterRec.lastUsedAt = Date.now();
      return masterRec;
    }

    // Both proxy and backend must observe revocations written by the other process.
    await this.hydrateFromIndex();
    // 1. Fast path: Memory lookup
    let cached = this.activeTokens.get(tokenHash);
    if (cached && !cached.kind) return null;
    if (cached) {
      if (isTokenExpired(cached)) {
        return null; // Expired
      }
      cached.lastUsedAt = Date.now();
      return cached;
    }

    // If cache miss, re-hydrate from index in case another process issued a token
    try {
      await this.hydrateFromIndex();
      cached = this.activeTokens.get(tokenHash);
      if (cached) {
        if (!cached.kind) return null;
        if (isTokenExpired(cached)) {
          return null;
        }
        cached.lastUsedAt = Date.now();
        return cached;
      }
    } catch (e) {}

    // 2. Vector similarity verification in embedded vector store
    try {
      const vector = hashToVector(tokenHash, 64);
      const results = await this.index.queryItems(vector, 1);
      if (results.length > 0 && results[0].score > 0.9999) {
        const item = results[0].item;
        if (item.metadata?.tokenHash === tokenHash && item.metadata.kind) {
          if (isTokenExpired(item.metadata)) {
            return null;
          }
          this.activeTokens.set(tokenHash, { id: item.id, ...item.metadata });
          return item.metadata;
        }
      }
    } catch (e) {}

    return null;
  }

  listTokens() {
    return Array.from(this.activeTokens.values()).map(tok => ({
      id: tok.id,
      name: tok.name,
      role: tok.role,
      isMaster: tok.isMaster,
      createdAt: tok.createdAt,
      expiresAt: tok.expiresAt,
      lastUsedAt: tok.lastUsedAt,
    }));
  }

  async revokeToken(id) {
    for (const [hash, tok] of this.activeTokens.entries()) {
      if (tok.id === id) {
        if (tok.isMaster) throw new Error('마스터 토큰은 폐기할 수 없습니다.');
        this.activeTokens.delete(hash);
        try { await this.index.deleteItem(id); } catch (e) {}
        return { success: true, id };
      }
    }
    throw new Error('해당 토큰을 찾을 수 없습니다.');
  }

  getMasterToken() {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const content = fs.readFileSync(TOKEN_FILE, 'utf8');
        const match = content.match(/NEXUS_ADMIN_TOKEN=([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
      }
    } catch (e) {}
    return null;
  }
}

module.exports = new AuthStore();
