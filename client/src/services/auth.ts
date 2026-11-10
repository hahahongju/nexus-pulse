/**
 * NexusPulse Client Authentication & Token Management Service
 * 
 * Supports:
 * - LocalStorage token persistence
 * - URL query parameter bootstrap (?token=...)
 * - Automatic Authorization header injection for fetch requests
 * - Vector DB token verification & status polling
 * - Reactive listener for auth state changes
 */

const TOKEN_STORAGE_KEY = 'nexus_auth_token';

type AuthListener = (token: string | null, user: any | null) => void;

export function normalizeToken(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();
  str = str.replace(/^Bearer\s+/i, '').trim();
  str = str.replace(/^(?:NEXUS_)?(?:ADMIN_)?TOKEN\s*[:=]\s*/i, '').trim();
  str = str.replace(/^["'`]|["'`]$/g, '').trim();
  return str;
}

class AuthService {
  private currentToken: string | null = null;
  private currentUser: any | null = null;
  private listeners: Set<AuthListener> = new Set();
  private initialized: boolean = false;

  constructor() {
    this.initFromStorage();
  }

  private initFromStorage() {
    if (typeof window === 'undefined') return;

    // Check URL query param first (?token=...)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      if (urlToken) {
        this.setToken(urlToken);
        // Clean URL to avoid leaking token in history/bookmarks
        urlParams.delete('token');
        const cleanUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '');
        window.history.replaceState({}, '', cleanUrl);
        return;
      }
    } catch (e) {}

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored && stored.trim()) {
        this.currentToken = normalizeToken(stored);
      }
    } catch (e) {}
  }

  public getToken(): string | null {
    if (!this.currentToken && typeof window !== 'undefined') {
      this.initFromStorage();
    }
    return this.currentToken;
  }

  public getUser(): any | null {
    return this.currentUser;
  }

  public setToken(token: string, user: any = null) {
    const clean = normalizeToken(token);
    if (clean) {
      this.currentToken = clean;
      this.currentUser = user;
      try {
        localStorage.setItem(TOKEN_STORAGE_KEY, clean);
      } catch (e) {}
    } else {
      this.clearToken();
      return;
    }
    this.notify();
  }

  public clearToken() {
    this.currentToken = null;
    this.currentUser = null;
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (e) {}
    this.notify();
  }

  public isAuthenticated(): boolean {
    return !!this.currentToken;
  }

  public subscribe(listener: AuthListener) {
    this.listeners.add(listener);
    // Initial call
    listener(this.currentToken, this.currentUser);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn(this.currentToken, this.currentUser));
  }

  /**
   * Logs in using user-friendly PIN or Password, receiving a 24-hour session token
   */
  public async loginWithPin(
    pin: string, 
    rememberMe: boolean = true
  ): Promise<{ 
    success: boolean; 
    user?: any; 
    error?: string; 
    remainingAttempts?: number; 
    remainingSec?: number;
    require2FA?: boolean;
    tempToken?: string;
  }> {
    if (!pin || !pin.trim()) {
      return { success: false, error: 'PIN 번호 또는 비밀번호를 입력해주세요.' };
    }

    try {
      const res = await fetch('/api/security/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: pin.trim(),
          rememberMe,
          deviceName: typeof navigator !== 'undefined' ? `${navigator.platform} (${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'})` : 'Browser'
        })
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        if (data.require2FA) {
          return {
            success: true,
            require2FA: true,
            tempToken: data.tempToken
          };
        }
        const { sessionToken, user } = data.data;
        this.setToken(sessionToken, user);
        return { success: true, user };
      } else {
        return {
          success: false,
          error: data.message || '인증에 실패했습니다.',
          remainingAttempts: data.attemptsRemaining,
          remainingSec: data.remainingSec
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message || '서버 통신 오류' };
    }
  }

  /**
   * Completes login with Google / Microsoft Authenticator 6-digit TOTP code
   */
  public async verify2FALogin(
    tempToken: string, 
    code: string
  ): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const res = await fetch('/api/security/2fa/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        const { sessionToken, user } = data.data;
        this.setToken(sessionToken, user);
        return { success: true, user };
      } else {
        return { success: false, error: data.message || '2FA 인증 코드가 일치하지 않습니다.' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || '서버 통신 오류' };
    }
  }

  /**
   * Generates QR Code and secret for Google/MS Authenticator setup
   */
  public async setup2FA(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.currentToken) headers['Authorization'] = `Bearer ${this.currentToken}`;
      const res = await fetch('/api/security/2fa/setup', { method: 'POST', headers });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        return { success: true, data: data.data };
      }
      return { success: false, error: data.message || '2FA 설정 생성 실패' };
    } catch (e: any) {
      return { success: false, error: e.message || '서버 통신 오류' };
    }
  }

  /**
   * Confirms and activates 2FA with 6-digit code
   */
  public async enable2FA(secret: string, code: string, backupCodes: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.currentToken) headers['Authorization'] = `Bearer ${this.currentToken}`;
      const res = await fetch('/api/security/2fa/enable', {
        method: 'POST',
        headers,
        body: JSON.stringify({ secret, code, backupCodes })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        return { success: true };
      }
      return { success: false, error: data.message || '2FA 활성화 실패' };
    } catch (e: any) {
      return { success: false, error: e.message || '서버 통신 오류' };
    }
  }

  /**
   * Disables 2FA with 6-digit code or backup code
   */
  public async disable2FA(code: string): Promise<{ success: boolean; error?: string }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.currentToken) headers['Authorization'] = `Bearer ${this.currentToken}`;
      const res = await fetch('/api/security/2fa/disable', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        return { success: true };
      }
      return { success: false, error: data.message || '2FA 비활성화 실패' };
    } catch (e: any) {
      return { success: false, error: e.message || '서버 통신 오류' };
    }
  }

  /**
   * Changes Administrator PIN or Master Password
   */
  public async changePin(currentPin: string, newPin: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.currentToken) {
        headers['Authorization'] = `Bearer ${this.currentToken}`;
      }
      const res = await fetch('/api/security/pin/change', {
        method: 'POST',
        headers,
        body: JSON.stringify({ currentPin, newPin })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data.message || 'PIN 변경 실패' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || '서버 통신 오류' };
    }
  }

  /**
   * Logout and revoke session token
   */
  public async logout(): Promise<void> {
    try {
      if (this.currentToken) {
        await fetch('/api/security/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.currentToken}` }
        });
      }
    } catch (e) {}
    this.clearToken();
  }

  /**
   * Validates current or provided token against the server's embedded vector database
   */
  public async verifyToken(tokenCandidate?: string): Promise<{ valid: boolean; user?: any; error?: string }> {
    const token = normalizeToken(tokenCandidate || this.currentToken);
    if (!token) {
      return { valid: false, error: '토큰이 입력되지 않았습니다.' };
    }

    try {
      const res = await fetch('/api/security/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ token })
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        if (!tokenCandidate || tokenCandidate === this.currentToken) {
          this.currentUser = data.data.user;
          this.notify();
        }
        return { valid: true, user: data.data.user };
      } else {
        return { valid: false, error: data.message || '유효하지 않은 토큰입니다.' };
      }
    } catch (err: any) {
      return { valid: false, error: err.message || '인증 서버 연결 실패' };
    }
  }

  /**
   * Fetches overall security status & vector DB info
   */
  public async getSecurityStatus(): Promise<any> {
    try {
      const headers: Record<string, string> = {};
      if (this.currentToken) {
        headers['Authorization'] = `Bearer ${this.currentToken}`;
      }
      const res = await fetch('/api/security/status', { headers });
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  /**
   * Installs global fetch interceptor to automatically add Authorization header
   */
  public installFetchInterceptor() {
    if (typeof window === 'undefined' || this.initialized) return;
    this.initialized = true;

    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let urlStr = '';
      if (typeof input === 'string') {
        urlStr = input;
      } else if (input instanceof URL) {
        urlStr = input.toString();
      } else if (input instanceof Request) {
        urlStr = input.url;
      }

      // Intercept calls to /api/
      const target = new URL(urlStr, window.location.href);
      if (target.origin === window.location.origin && target.pathname.startsWith('/api/')) {
        const token = this.getToken();
        if (token) {
          const customHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : {}));
          if (!customHeaders.has('Authorization')) {
            customHeaders.set('Authorization', `Bearer ${token}`);
          }
          init = { ...init, headers: customHeaders };
        }
      }

      const response = await originalFetch(input, init);

      // Notify if 401 Unauthorized occurs on an API call
      if (response.status === 401 && urlStr.includes('/api/')) {
        window.dispatchEvent(new CustomEvent('nexus:unauthorized', { detail: { url: urlStr } }));
      }

      return response;
    };
  }
}

export const authService = new AuthService();
