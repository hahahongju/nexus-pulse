import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Shield, 
  Key, 
  Lock, 
  Unlock, 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Copy, 
  Check, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff,
  Delete,
  KeyRound,
  LogOut,
  Sparkles,
  Smartphone,
  QrCode,
  ArrowLeft,
  RefreshCw,
  Download
} from 'lucide-react';
import { authService, normalizeToken } from '../services/auth';
import { wsClient } from '../services/websocket';
import { sound } from '../services/sound';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'login' | '2fa' | 'change_pin' | 'api_tokens';
}

export const SecurityModal: React.FC<SecurityModalProps> = ({ isOpen, onClose, initialTab }) => {
  // Authentication & Session State
  const [pinInput, setPinInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [useTextInput, setUseTextInput] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 2FA Login State
  const [is2FAPending, setIs2FAPending] = useState(false);
  const [temp2FAToken, setTemp2FAToken] = useState<string | null>(null);
  const [totpInput, setTotpInput] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  // Status & Info
  const [secStatus, setSecStatus] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'login' | '2fa' | 'change_pin' | 'api_tokens'>('2fa');

  // 2FA Management State
  const [setup2FAData, setSetup2FAData] = useState<any>(null);
  const [setupVerifyCode, setSetupVerifyCode] = useState('');
  const [disable2FACode, setDisable2FACode] = useState('');
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  // Change PIN State
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // API Tokens State (Advanced)
  const [tokensList, setTokensList] = useState<any[]>([]);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenRole, setNewTokenRole] = useState('operator');
  const [newTokenDays, setNewTokenDays] = useState('30');
  const [issuedTokenData, setIssuedTokenData] = useState<any>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const totpInputRef = useRef<HTMLInputElement>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const isStartingSetupRef = useRef<boolean>(false);
  const [justEnabledBackupCodes, setJustEnabledBackupCodes] = useState<string[] | null>(null);
  const [showManualKey, setShowManualKey] = useState<boolean>(false);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => document.querySelector<HTMLButtonElement>('[aria-label="보안 설정 닫기"]')?.focus(), 0);
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const elements = [...document.querySelectorAll<HTMLElement>('.security-dialog button:not(:disabled), .security-dialog input:not(:disabled), .security-dialog select:not(:disabled)')].filter(element => element.getClientRects().length > 0);
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleDialogKey);
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', handleDialogKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setPinInput('');
      setTotpInput('');
      setIs2FAPending(false);
      setTemp2FAToken(null);
      setErrorMsg(null);
      setSuccessMsg(null);
      setSetup2FAData(null);
      setJustEnabledBackupCodes(null);
      setShowManualKey(false);
      setShowDisableConfirm(false);
      isStartingSetupRef.current = false;
      if (initialTab) {
        setActiveTab(initialTab);
      } else if (authService.isAuthenticated()) {
        setActiveTab('2fa');
      } else {
        setActiveTab('login');
      }
      refreshStatus();
    }
  }, [isOpen, initialTab]);

  // Auto-fetch 2FA setup QR Code when opening 2FA tab if not yet enabled
  useEffect(() => {
    if (isOpen && activeTab === '2fa' && authService.isAuthenticated()) {
      if (secStatus && !secStatus.pin?.twoFactorEnabled && !setup2FAData && !justEnabledBackupCodes && !loading && !isStartingSetupRef.current) {
        handleStart2FASetup();
      }
    }
  }, [isOpen, activeTab, secStatus?.pin?.twoFactorEnabled, setup2FAData, justEnabledBackupCodes]);

  useEffect(() => {
    if (is2FAPending) {
      setTimeout(() => totpInputRef.current?.focus(), 100);
    }
  }, [is2FAPending]);

  // Listen to physical keyboard when PIN modal is open and on PIN screen
  useEffect(() => {
    if (!isOpen || authService.isAuthenticated() || activeTab !== 'login' || is2FAPending) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handlePinSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pinInput, activeTab, is2FAPending, rememberMe]);

  const refreshStatus = async () => {
    try {
      const statusData = await authService.getSecurityStatus();
      if (statusData && statusData.status === 'ok') {
        setSecStatus(statusData);
      }
      if (authService.isAuthenticated() && activeTab === 'api_tokens') {
        const res = await fetch('/api/security/tokens');
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'ok') {
            setTokensList(data.data || []);
          }
        }
      }
    } catch (e) {}
  };

  if (!isOpen) return null;

  const isAuth = authService.isAuthenticated();

  const handleDigitPress = (digit: string) => {
    if (pinInput.length >= 16) return;
    sound.playClick();
    const next = pinInput + digit;
    setPinInput(next);
    setErrorMsg(null);
  };

  const handleBackspace = () => {
    sound.playClick();
    setPinInput(prev => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClearPin = () => {
    sound.playClick();
    setPinInput('');
    setErrorMsg(null);
  };

  const handlePinSubmit = async (overridePin?: string) => {
    const candidate = overridePin || pinInput;
    if (!candidate.trim()) {
      setErrorMsg('PIN 번호 또는 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    sound.playClick();

    const result = await authService.loginWithPin(candidate, rememberMe);
    setLoading(false);

    if (result.success) {
      if (result.require2FA && result.tempToken) {
        sound.playTabSwitch();
        setIs2FAPending(true);
        setTemp2FAToken(result.tempToken);
        setSuccessMsg('PIN이 확인되었습니다. Google 또는 MS Authenticator의 6자리 인증 코드를 입력하세요.');
        return;
      }

      sound.playTabSwitch();
      setPinInput('');
      setSuccessMsg('환영합니다! 관리자 세션이 30일간 안전하게 유지됩니다.');
      const token = authService.getToken();
      if (token) wsClient.authenticate(token);
      refreshStatus();
    } else {
      sound.playAlertWarning();
      setPinInput('');
      if (result.remainingSec) {
        setErrorMsg(`연속 오입력으로 잠금되었습니다. ${result.remainingSec}초 후에 다시 시도하세요.`);
      } else if (result.remainingAttempts !== undefined) {
        setErrorMsg(`PIN 번호가 일치하지 않습니다. (남은 시도: ${result.remainingAttempts}회)`);
      } else {
        setErrorMsg(result.error || '인증에 실패했습니다.');
      }
    }
  };

  const handle2FASubmit = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    const candidateCode = (overrideCode !== undefined ? overrideCode : totpInput).trim();
    if (!temp2FAToken || !candidateCode || loading) {
      if (!temp2FAToken) {
        setErrorMsg('인증 세션이 만료되었습니다. PIN을 다시 입력해주세요.');
        setIs2FAPending(false);
      } else if (!candidateCode) {
        setErrorMsg('인증 코드를 입력해주세요.');
      }
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    sound.playClick();

    const result = await authService.verify2FALogin(temp2FAToken, candidateCode);
    setLoading(false);

    if (result.success) {
      sound.playTabSwitch();
      setIs2FAPending(false);
      setTemp2FAToken(null);
      setTotpInput('');
      setSuccessMsg('2FA 인증 성공! 관리자 세션이 활성화되었습니다.');
      const token = authService.getToken();
      if (token) wsClient.authenticate(token);
      refreshStatus();
    } else {
      sound.playAlertWarning();
      setErrorMsg(result.error || '인증 코드가 올바르지 않습니다.');
    }
  };

  // 2FA Setup Flow
  const handleStart2FASetup = async () => {
    if (isStartingSetupRef.current) return;
    isStartingSetupRef.current = true;
    setLoading(true);
    setErrorMsg(null);
    sound.playClick();
    try {
      const res = await authService.setup2FA();
      if (res.success) {
        setSetup2FAData(res.data);
        sound.playTabSwitch();
        setTimeout(() => {
          modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 50);
      } else {
        setErrorMsg(res.error || '2FA 설정 생성 실패');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '2FA 설정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      isStartingSetupRef.current = false;
    }
  };

  const handleConfirm2FAEnable = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    const code = (overrideCode !== undefined ? overrideCode : setupVerifyCode).trim();
    if (!setup2FAData || !code || loading) {
      return;
    }

    if (code.length !== 6) {
      setErrorMsg('Authenticator 앱의 6자리 번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    sound.playClick();
    try {
      const res = await authService.enable2FA(setup2FAData.secret, code, setup2FAData.backupCodes);
      if (res.success) {
        sound.playTabSwitch();
        setJustEnabledBackupCodes(setup2FAData.backupCodes || []);
        setSetup2FAData(null);
        setSetupVerifyCode('');
        refreshStatus();
      } else {
        sound.playAlertWarning();
        setErrorMsg(res.error || '인증 코드가 일치하지 않습니다. 스마트폰 시간 및 6자리를 확인해주세요.');
      }
    } catch (err: any) {
      sound.playAlertWarning();
      setErrorMsg(err.message || '인증 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disable2FACode.trim()) {
      setErrorMsg('인증 코드 또는 복구 코드를 입력해주세요.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    sound.playClick();
    const res = await authService.disable2FA(disable2FACode.trim());
    setLoading(false);

    if (res.success) {
      sound.playTabSwitch();
      setSuccessMsg('2단계 인증(2FA)이 해제되었습니다.');
      setShowDisableConfirm(false);
      setDisable2FACode('');
      refreshStatus();
    } else {
      sound.playAlertWarning();
      setErrorMsg(res.error || '인증 코드가 일치하지 않습니다.');
    }
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPin.length < 4) {
      setErrorMsg('새 PIN(비밀번호)은 최소 4자리 이상이어야 합니다.');
      return;
    }

    if (newPin !== confirmPin) {
      setErrorMsg('새 PIN 번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    sound.playClick();
    const result = await authService.changePin(currentPin, newPin);
    setLoading(false);

    if (result.success) {
      sound.playTabSwitch();
      setSuccessMsg(result.message || 'PIN 번호가 성공적으로 변경되었습니다!');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      refreshStatus();
    } else {
      sound.playAlertWarning();
      setErrorMsg(result.error || 'PIN 변경에 실패했습니다.');
    }
  };

  const handleLogout = async () => {
    sound.playClick();
    await authService.logout();
    setPinInput('');
    setSuccessMsg('로그아웃 되었습니다. 게스트 읽기 전용 모드로 전환됩니다.');
    setActiveTab('login');
    refreshStatus();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    sound.playClick();
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleCreateToken = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    sound.playClick();

    try {
      const res = await fetch('/api/security/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTokenName.trim() || 'API Client',
          role: newTokenRole,
          expiresInDays: parseInt(newTokenDays, 10) || null
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setIssuedTokenData(data.data);
        setNewTokenName('');
        refreshStatus();
      } else {
        setErrorMsg(data.message || '토큰 발급 실패');
      }
    } catch (e: any) {
      setErrorMsg(e.message || '토큰 발급 오류');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeToken = async (id: string) => {
    if (!confirm('이 토큰을 폐기하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/security/tokens/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setSuccessMsg('토큰이 안전하게 폐기되었습니다.');
        refreshStatus();
      } else {
        setErrorMsg(data.message || '토큰 폐기 실패');
      }
    } catch (e: any) {
      setErrorMsg(e.message || '폐기 처리 오류');
    }
  };

  const isInitialPin = secStatus?.pin?.isInitialPin;
  const is2FAEnabled = secStatus?.pin?.twoFactorEnabled;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="security-title" className="security-dialog relative w-full max-w-md max-h-[90dvh] my-auto flex flex-col rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl overflow-hidden font-sans transition-all duration-200">
        
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-surface)]">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl border ${
              isAuth 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-[var(--accent-primary-muted)] border-[var(--border-focus)] text-[var(--accent-primary)]'
            }`}>
              {isAuth ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h2 id="security-title" className="text-sm font-bold text-[var(--text-main)] flex items-center gap-2">
                {isAuth ? '관리자 보안 센터' : (is2FAPending ? '2단계 OTP 인증' : '간편 PIN 잠금 해제')}
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {is2FAEnabled ? 'OTP 사용 중' : '비밀번호'}
                </span>
              </h2>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {isAuth 
                  ? '비밀번호와 2단계 인증을 관리하세요' 
                  : (is2FAPending ? 'Google / MS Authenticator 6자리 코드' : '기억하기 쉬운 PIN으로 빠른 인증')}
              </p>
            </div>
          </div>
          <button
            aria-label="보안 설정 닫기"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs (When Authenticated) */}
        {isAuth && (
          <div className="shrink-0 flex border-b border-[var(--border-color)] bg-[var(--bg-surface)] text-xs">
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-2.5 px-2 flex items-center justify-center gap-1 font-semibold transition-colors border-b-2 ${
                activeTab === 'login'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--bg-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>상태</span>
            </button>
            <button
              onClick={() => setActiveTab('2fa')}
              className={`flex-1 py-2.5 px-2 flex items-center justify-center gap-1 font-semibold transition-colors border-b-2 ${
                activeTab === '2fa'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--bg-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>2단계 인증</span>
            </button>
            <button
              onClick={() => setActiveTab('change_pin')}
              className={`flex-1 py-2.5 px-2 flex items-center justify-center gap-1 font-semibold transition-colors border-b-2 ${
                activeTab === 'change_pin'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--bg-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>비밀번호 변경</span>
            </button>
            <button
              onClick={() => setActiveTab('api_tokens')}
              style={{ display: 'none' }}
              className={`flex-1 py-2.5 px-2 flex items-center justify-center gap-1 font-semibold transition-colors border-b-2 ${
                activeTab === 'api_tokens'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--bg-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>고급 자동화 연동</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div ref={modalBodyRef} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs text-[var(--text-sub)] overscroll-contain">
          
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* 2FA STEP 2: TOTP OTP CODE INPUT                          */}
          {/* ======================================================== */}
          {!isAuth && is2FAPending && (
            <form onSubmit={handle2FASubmit} className="space-y-4 animate-in fade-in">
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 space-y-1.5 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-cyan-200">
                  <Smartphone className="w-4 h-4" />
                  <span>Google / MS Authenticator 인증</span>
                </div>
                <p className="text-[11px] leading-relaxed text-cyan-400/90">
                  스마트폰의 Authenticator 앱에 표시된 6자리 번호를 입력하세요.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center py-2 space-y-2">
                <input
                  ref={totpInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={useBackupCode ? 9 : 6}
                  value={totpInput}
                  onChange={(e) => {
                    const clean = useBackupCode 
                      ? e.target.value.replace(/[^0-9-]/g, '') 
                      : e.target.value.replace(/\D/g, '');
                    setTotpInput(clean);
                    setErrorMsg(null);
                    // Auto submit if 6 digits entered
                    if (useBackupCode) {
                      if (clean.replace(/-/g, '').length === 8) {
                        handle2FASubmit(undefined, clean);
                      }
                    } else if (clean.length === 6) {
                      handle2FASubmit(undefined, clean);
                    }
                  }}
                  placeholder={useBackupCode ? "1234-5678" : "000000"}
                  className="w-48 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] text-center text-2xl tracking-[0.3em] font-bold focus:border-[var(--accent-primary)] outline-none font-mono"
                  autoFocus
                />
                <span className="text-[10px] text-[var(--text-muted)]">
                  {useBackupCode ? '비상 복구 코드 (8자리)' : '30초마다 갱신되는 6자리 번호'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] px-1">
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setTotpInput('');
                    sound.playClick();
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
                >
                  {useBackupCode ? '6자리 OTP 코드로 전환' : '비상 복구 코드로 인증'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIs2FAPending(false);
                    setTotpInput('');
                    sound.playClick();
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>PIN 다시 입력</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || totpInput.length === 0}
                className="w-full py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-lg"
              >
                {loading ? '인증 중...' : '2FA 인증 완료 (Verify)'}
              </button>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB: LOGIN / PIN ENTRY (Unauthenticated State)           */}
          {/* ======================================================== */}
          {!isAuth && !is2FAPending && (
            <div className="space-y-4">
              
              {/* Initial PIN Guidance Banner */}
              {isInitialPin && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <span className="font-bold block text-amber-200">초기 기본 PIN: [ 1234 ]</span>
                    키패드에 1234를 입력하여 잠금 해제할 수 있습니다. (로그인 후 즉시 변경 가능)
                  </div>
                </div>
              )}

              <p className="text-xs text-[var(--text-muted)]">비밀번호와 OTP로 로그인하세요. 로그인 정보는 앱이 자동으로 관리합니다.</p>

              {/* PIN Dot Display / Input Field */}
              <div className="flex flex-col items-center justify-center pt-1 pb-2">
                {!useTextInput ? (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="flex items-center space-x-3 h-10 px-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                      {Array.from({ length: Math.max(4, pinInput.length) }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-3 h-3 rounded-full transition-all duration-150 ${
                            i < pinInput.length
                              ? 'bg-[var(--accent-primary)] scale-110 shadow-[0_0_8px_var(--accent-primary)]'
                              : 'bg-zinc-700 border border-zinc-600'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      키보드 숫자 키 또는 아래 핀패드를 누르세요
                    </span>
                  </div>
                ) : (
                  <div className="w-full relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="PIN 또는 비밀번호 입력..."
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] text-center text-sm tracking-widest placeholder-[var(--text-muted)] focus:border-[var(--accent-primary)] outline-none"
                      autoFocus
                    />
                    <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Numeric PIN Pad Grid */}
              {!useTextInput && (
                <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleDigitPress(digit)}
                      className="h-12 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] hover:border-[var(--border-hover)] text-lg font-bold text-[var(--text-main)] transition-all active:scale-95 flex items-center justify-center select-none shadow-sm"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleClearPin}
                    className="h-12 rounded-xl bg-[var(--bg-surface)]/60 hover:bg-[var(--bg-surface-hover)] text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors flex items-center justify-center font-semibold select-none"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDigitPress('0')}
                    className="h-12 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] hover:border-[var(--border-hover)] text-lg font-bold text-[var(--text-main)] transition-all active:scale-95 flex items-center justify-center select-none shadow-sm"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="h-12 rounded-xl bg-[var(--bg-surface)]/60 hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex items-center justify-center select-none"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Remember Me & Input Mode Toggle */}
              <div className="flex items-center justify-between pt-1 px-1 text-[11px]">
                <label className="flex items-center gap-2 cursor-pointer select-none text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-[var(--border-color)] text-[var(--accent-primary)] focus:ring-0"
                  />
                  <span>이 기기 30일간 로그인 유지</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setUseTextInput(!useTextInput);
                    sound.playClick();
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
                >
                  {useTextInput ? '숫자 핀패드 모드' : '텍스트 비밀번호 모드'}
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="button"
                onClick={() => handlePinSubmit()}
                disabled={loading || pinInput.length === 0}
                className="w-full py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-lg"
              >
                {loading ? '검증 중...' : '잠금 해제 (Unlock)'}
              </button>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: AUTHENTICATED OVERVIEW (Active Session)              */}
          {/* ======================================================== */}
          {isAuth && activeTab === 'login' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    관리자 권한 활성화됨
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/40">
                    신뢰 기기 세션
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-sub)] leading-relaxed">
                  이 기기에서 로그인되어 있습니다. 비밀번호 변경과 OTP 설정은 위 메뉴에서 관리할 수 있습니다. 공용 기기에서는 사용 후 로그아웃하세요.
                </p>
              </div>

              {/* Security Specs Card */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-main)]">
                  <span className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[var(--accent-primary)]" />
                    보안 상태 요약
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {is2FAEnabled ? '2FA Active' : 'PIN Protected'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <span className="text-[var(--text-muted)] block text-[10px]">2단계 인증 (2FA)</span>
                    <span className={`font-semibold ${is2FAEnabled ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {is2FAEnabled ? '사용 중' : '사용 안 함 · 설정 권장'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <span className="text-[var(--text-muted)] block text-[10px]">로그인 방법</span>
                    <span className="text-[var(--text-main)] font-semibold">{is2FAEnabled ? '비밀번호 + OTP' : '비밀번호'}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('2fa')}
                  className="py-2.5 px-3 rounded-xl bg-[var(--accent-primary-muted)] hover:bg-[var(--accent-primary)] hover:text-black border border-[var(--border-focus)] text-[var(--accent-primary)] font-semibold flex items-center justify-center gap-1.5 transition-all text-xs"
                >
                  <QrCode className="w-4 h-4" />
                  <span>2단계 인증 설정</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('change_pin')}
                  className="py-2.5 px-3 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold flex items-center justify-center gap-1.5 transition-colors text-xs"
                >
                  <KeyRound className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>비밀번호 변경</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 px-4 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-semibold flex items-center justify-center gap-1.5 transition-colors text-xs"
              >
                <LogOut className="w-4 h-4" />
                <span>로그아웃 (세션 폐기)</span>
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: 2FA (GOOGLE / MS AUTHENTICATOR SETUP)               */}
          {/* ======================================================== */}
          {isAuth && activeTab === '2fa' && (
            <div className="space-y-4 animate-in fade-in">
              
              {/* STATE 1: Just Enabled Success & Emergency Backup Codes Screen */}
              {justEnabledBackupCodes && (
                <div className="space-y-4 text-center animate-in fade-in">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-main)]">
                      2단계 인증(2FA) 연동 완료
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                      스마트폰 분실 시 계정을 복구할 수 있는 비상 복구 코드입니다.<br />
                      안전한 장소에 복사하거나 저장해 두세요.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2.5 text-left">
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)] px-1">
                      <span className="font-semibold text-[var(--text-main)]">비상 복구 코드 (8개)</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(justEnabledBackupCodes.join('\n'))}
                        className="text-[var(--accent-primary)] hover:underline flex items-center gap-1 cursor-pointer font-medium text-xs"
                      >
                        {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedToken ? '복사 완료' : '전체 복사'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono text-[var(--text-main)]">
                      {justEnabledBackupCodes.map((code, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-center tracking-wider select-all font-semibold"
                        >
                          {code}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setJustEnabledBackupCodes(null);
                      sound.playClick();
                    }}
                    className="w-full py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-black font-bold text-xs transition-all shadow-lg cursor-pointer"
                  >
                    복구 코드 보관 완료 및 확인
                  </button>
                </div>
              )}

              {/* STATE 2: 2FA is currently ENABLED */}
              {is2FAEnabled && !justEnabledBackupCodes && !showDisableConfirm && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2">
                    <div className="flex items-center gap-2.5 font-bold text-sm text-emerald-400">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <span>Google / MS Authenticator 2FA 활성화됨</span>
                    </div>
                    <p className="text-xs text-[var(--text-sub)] leading-relaxed pl-7">
                      새로운 기기나 세션 만료 후 로그인할 때 모바일 OTP 6자리 번호로 계정이 안전하게 보호됩니다.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2 text-xs">
                    <div className="font-semibold text-[var(--text-main)] flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span>보안 및 인증 사양</span>
                    </div>
                    <ul className="space-y-1.5 text-[var(--text-muted)] pl-2 leading-relaxed">
                      <li>• 표준 프로토콜: RFC 6238 TOTP (30초 시간 기반 일회용 번호)</li>
                      <li>• 100% 무료: SMS 문자 요금이나 외부 클라우드 비용 0원</li>
                      <li>• 로컬 보안: 서버 오프라인 환경에서도 로컬 암호학으로 안전하게 동작</li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowDisableConfirm(true);
                      sound.playClick();
                    }}
                    className="w-full py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <span>2단계 인증(2FA) 비활성화 (해제)</span>
                  </button>
                </div>
              )}

              {/* Confirm Disable 2FA Form */}
              {is2FAEnabled && !justEnabledBackupCodes && showDisableConfirm && (
                <form onSubmit={handleDisable2FA} className="space-y-3.5 p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 animate-in fade-in">
                  <div className="text-xs font-bold text-rose-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>2단계 인증 해제 확인</span>
                  </div>
                  <p className="text-xs text-[var(--text-sub)] leading-relaxed">
                    안전을 위해 모바일 Authenticator의 현재 6자리 번호 또는 비상 복구 코드를 입력해주세요.
                  </p>
                  <input
                    type="text"
                    value={disable2FACode}
                    onChange={(e) => setDisable2FACode(e.target.value)}
                    placeholder="6자리 번호 또는 복구 코드..."
                    className="w-full p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] text-xs outline-none focus:border-rose-500 font-mono text-center tracking-widest"
                    required
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDisableConfirm(false);
                        sound.playClick();
                      }}
                      className="flex-1 py-2 rounded-xl bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold cursor-pointer border border-[var(--border-color)]"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      {loading ? '해제 중...' : '해제 확인'}
                    </button>
                  </div>
                </form>
              )}

              {/* STATE 3: Setup Flow (Single-column, Clean, Zero-Scroll) */}
              {!is2FAEnabled && !justEnabledBackupCodes && (
                <div className="space-y-4 animate-in fade-in">
                  
                  {/* Step Title & Guidance */}
                  <div className="text-center space-y-1">
                    <h3 className="text-sm font-bold text-[var(--text-main)] flex items-center justify-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span>Google OTP / MS Authenticator 연동</span>
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      스마트폰의 OTP 앱으로 아래 QR 코드를 스캔하세요. (100% 무료)
                    </p>
                  </div>

                  {setup2FAData ? (
                    <form onSubmit={handleConfirm2FAEnable} className="space-y-4">
                      {/* Crisp Centered QR Code Card */}
                      <div className="flex flex-col items-center justify-center">
                        <div className="p-3.5 bg-white rounded-2xl shadow-xl border border-zinc-200 inline-block">
                          <img
                            src={setup2FAData.qrCodeDataUrl}
                            alt="2FA QR Code"
                            className="w-44 h-44 sm:w-48 sm:h-48 object-contain rounded-lg"
                          />
                        </div>
                        <span className="text-xs text-[var(--text-muted)] mt-2 font-medium">
                          스마트폰 카메라 또는 Authenticator 앱으로 스캔
                        </span>
                      </div>

                      {/* Manual Secret Key Accordion / Toggle */}
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setShowManualKey(!showManualKey);
                            sound.playClick();
                          }}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors underline-offset-4 hover:underline cursor-pointer"
                        >
                          {showManualKey ? '시크릿 키 숨기기' : '카메라 스캔이 어려우신가요? (키 직접 입력)'}
                        </button>
                        {showManualKey && (
                          <div className="mt-2 w-full p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-between gap-2 animate-in fade-in">
                            <code className="text-xs font-mono text-cyan-300 select-all tracking-wider break-all font-semibold">
                              {setup2FAData.secret}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(setup2FAData.secret)}
                              className="shrink-0 px-2.5 py-1 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-surface-hover)] text-xs text-[var(--text-main)] border border-[var(--border-color)] flex items-center gap-1 cursor-pointer"
                            >
                              {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedToken ? '복사됨' : '복사'}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 6-Digit Code Input */}
                      <div className="space-y-1.5 text-center pt-1">
                        <label className="block text-xs font-semibold text-[var(--text-main)]">
                          스마트폰 앱에 표시된 6자리 번호 입력
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          value={setupVerifyCode}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setSetupVerifyCode(val);
                            setErrorMsg(null);
                            if (val.length === 6) {
                              handleConfirm2FAEnable(undefined, val);
                            }
                          }}
                          placeholder="000000"
                          className="w-48 mx-auto py-2.5 px-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] text-center text-2xl font-mono tracking-[0.35em] font-bold focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] outline-none"
                        />
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={loading || setupVerifyCode.length !== 6}
                        className="w-full py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-black font-bold text-xs transition-all disabled:opacity-40 shadow-lg cursor-pointer flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            <span>확인 중...</span>
                          </>
                        ) : (
                          <span>2단계 인증(2FA) 연동 완료</span>
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center space-y-3">
                      {loading ? (
                        <>
                          <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                          <p className="text-xs text-[var(--text-muted)] font-medium">OTP QR 코드를 생성하고 있습니다...</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-[var(--text-muted)]">QR 코드를 생성할 준비가 되었습니다.</p>
                          <button
                            type="button"
                            onClick={handleStart2FASetup}
                            className="px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-black font-bold text-xs cursor-pointer shadow-md"
                          >
                            QR 코드 생성하기
                          </button>
                        </>
                      )}
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: CHANGE PIN                                          */}
          {/* ======================================================== */}
          {isAuth && activeTab === 'change_pin' && (
            <form onSubmit={handleChangePinSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[var(--text-main)]">
                  현재 PIN (또는 기본 1234)
                </label>
                <input
                  type="password"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="현재 PIN 입력..."
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] text-xs outline-none focus:border-[var(--accent-primary)]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[var(--text-main)]">
                  새 PIN (최소 4자리 이상)
                </label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="새로 사용할 PIN 또는 비밀번호..."
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] text-xs outline-none focus:border-[var(--accent-primary)]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[var(--text-main)]">
                  새 PIN 확인
                </label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="새 PIN 다시 입력..."
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] text-xs outline-none focus:border-[var(--accent-primary)]"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 mt-2"
              >
                {loading ? '변경 중...' : 'PIN 번호 저장하기'}
              </button>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB: API TOKENS (Advanced)                               */}
          {/* ======================================================== */}
          {isAuth && activeTab === 'api_tokens' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3">
                <span className="text-xs font-semibold text-[var(--text-main)] block">
                  외부 스크립트용 영구 API 토큰 발급
                </span>
                <div className="grid grid-cols-1 gap-2">
                  <input
                    type="text"
                    placeholder="클라이언트 명칭 (예: Home Assistant, iPad)"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-main)] outline-none text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newTokenRole}
                      onChange={(e) => setNewTokenRole(e.target.value)}
                      className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-main)] outline-none text-xs"
                    >
                      <option value="operator">Operator (운영자)</option>
                      <option value="admin">Administrator (관리자)</option>
                    </select>
                    <select
                      value={newTokenDays}
                      onChange={(e) => setNewTokenDays(e.target.value)}
                      className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-main)] outline-none text-xs"
                    >
                      <option value="30">30일 유효</option>
                      <option value="365">1년 유효</option>
                      <option value="0">영구 (무제한)</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleCreateToken}
                  disabled={loading}
                  className="w-full py-1.5 rounded-lg bg-[var(--accent-primary-muted)] border border-[var(--border-focus)] text-[var(--accent-primary)] font-semibold hover:bg-[var(--accent-primary)] hover:text-black transition-all"
                >
                  + API 토큰 생성
                </button>

                {issuedTokenData && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-1 animate-in fade-in">
                    <div className="text-[10px] font-bold text-emerald-400 flex items-center justify-between">
                      <span>새 토큰 생성됨:</span>
                      <button
                        onClick={() => handleCopy(issuedTokenData.token)}
                        className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300"
                      >
                        {copiedToken ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedToken ? '복사됨' : '복사'}
                      </button>
                    </div>
                    <code className="block p-1.5 rounded bg-black/40 text-emerald-300 text-[10px] break-all select-all">
                      {issuedTokenData.token}
                    </code>
                  </div>
                )}
              </div>

              {/* Active Tokens Table */}
              {tokensList.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-[var(--text-main)] block">
                    발급된 토큰 목록 ({tokensList.length})
                  </span>
                  <div className="border border-[var(--border-color)] rounded-xl overflow-hidden max-h-36 overflow-y-auto">
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-[var(--bg-surface)] text-[var(--text-muted)] border-b border-[var(--border-color)]">
                        <tr>
                          <th className="px-2.5 py-1.5">이름</th>
                          <th className="px-2.5 py-1.5">역할</th>
                          <th className="px-2.5 py-1.5 text-right">폐기</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)]">
                        {tokensList.map((tok) => (
                          <tr key={tok.id} className="hover:bg-[var(--bg-surface-hover)]">
                            <td className="px-2.5 py-1.5 text-[var(--text-main)] font-medium">
                              {tok.name}
                              {tok.isMaster && <span className="ml-1 text-[8px] text-emerald-400">[MASTER]</span>}
                            </td>
                            <td className="px-2.5 py-1.5 uppercase text-[var(--text-sub)]">{tok.role}</td>
                            <td className="px-2.5 py-1.5 text-right">
                              {!tok.isMaster ? (
                                <button
                                  onClick={() => handleRevokeToken(tok.id)}
                                  className="text-rose-400 hover:text-rose-300"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-[9px] text-[var(--text-muted)]">보호</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-color)] bg-[var(--bg-surface)] flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <Smartphone className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>Google / Microsoft Authenticator 지원</span>
          </div>
          <button
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-main)] hover:border-[var(--border-hover)] transition-colors text-xs"
          >
            닫기
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
