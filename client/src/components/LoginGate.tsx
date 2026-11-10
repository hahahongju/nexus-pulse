import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Lock, 
  Unlock, 
  Key, 
  Delete, 
  Eye, 
  EyeOff, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Smartphone, 
  ArrowLeft,
  Server,
  Radio,
  Clock
} from 'lucide-react';
import { authService } from '../services/auth';
import { wsClient } from '../services/websocket';
import { sound } from '../services/sound';

interface LoginGateProps {
  onLoginSuccess: (user: any) => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({ onLoginSuccess }) => {
  const [pinInput, setPinInput] = useState('');
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
  const [currentTime, setCurrentTime] = useState(new Date());

  const totpInputRef = useRef<HTMLInputElement>(null);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch security status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/security/status');
        if (res.ok) {
          const data = await res.json();
          setSecStatus(data);
        }
      } catch (e) {}
    })();
  }, []);

  // Focus TOTP input when 2FA is required
  useEffect(() => {
    if (is2FAPending) {
      setTimeout(() => totpInputRef.current?.focus(), 150);
    }
  }, [is2FAPending]);

  // Listen to physical keyboard when on PIN screen
  useEffect(() => {
    if (is2FAPending || useTextInput) return;

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
  }, [pinInput, is2FAPending, useTextInput]);

  const handleDigitPress = (digit: string) => {
    if (pinInput.length >= 16) return;
    sound.playClick();
    setPinInput(prev => prev + digit);
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

    const result = await authService.loginWithPin(candidate);
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
      setSuccessMsg('잠금 해제 성공! 대시보드로 이동합니다...');
      const token = authService.getToken();
      if (token) wsClient.authenticate(token);
      setTimeout(() => onLoginSuccess(result.user), 300);
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
      setSuccessMsg('2FA 인증 성공! 대시보드로 이동합니다...');
      const token = authService.getToken();
      if (token) wsClient.authenticate(token);
      setTimeout(() => onLoginSuccess(result.user), 300);
    } else {
      sound.playAlertWarning();
      setErrorMsg(result.error || '인증 코드가 올바르지 않습니다.');
    }
  };

  const handleOtpDigitPress = (digit: string) => {
    if (loading || useBackupCode || totpInput.length >= 6) return;
    sound.playClick();
    const next = `${totpInput}${digit}`;
    setTotpInput(next);
    setErrorMsg(null);
    if (next.length === 6) void handle2FASubmit(undefined, next);
  };

  const isInitialPin = secStatus?.pin?.isInitialPin;
  const is2FAEnabled = secStatus?.pin?.twoFactorEnabled;

  return (
    <div className="min-h-screen w-full bg-[var(--bg-primary)] text-slate-100 flex flex-col items-center justify-between p-4 sm:p-8 font-sans select-none relative overflow-hidden">
      
      {/* Background Subtle Tech Patterns */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-[var(--accent-primary)]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar: System Brand & Live Clock */}
      <header className="w-full max-w-5xl flex items-center justify-between z-10 py-2">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-[var(--accent-primary-muted)] border border-[var(--border-focus)] text-[var(--accent-primary)] shadow-lg shadow-[var(--accent-primary)]/10">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
              <span>NexusPulse</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-muted)] font-normal">
                Security Perimeter v1.0
              </span>
            </h1>
            <p className="text-[11px] text-[var(--text-muted)]">
              Next-Gen Autonomous Telemetry & Operations OS
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center space-x-4 text-right">
          <div>
            <div className="text-sm font-bold text-[var(--text-main)] flex items-center justify-end gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{currentTime.toLocaleTimeString()}</span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {currentTime.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      {/* Center Screen: Lock Screen Card */}
      <div className="w-full max-w-md my-auto z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-3xl bg-[var(--bg-surface)]/90 backdrop-blur-xl border border-[var(--border-color)] shadow-2xl p-6 sm:p-8 space-y-6">
          
          {/* Card Title & Lock Icon */}
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-[var(--accent-primary-muted)] border border-[var(--border-focus)] text-[var(--accent-primary)] mb-1 shadow-inner">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-[var(--text-main)]">
              {is2FAPending ? '2단계 OTP 인증' : '시스템 잠금 해제'}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {is2FAPending 
                ? 'Google 또는 Microsoft Authenticator 6자리 코드 입력' 
                : '대시보드 접근을 위해 관리자 PIN을 입력하세요'}
            </p>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="leading-snug">{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="leading-snug">{successMsg}</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 2: 2FA TOTP VERIFICATION                            */}
          {/* ======================================================== */}
          {is2FAPending ? (
            <form onSubmit={handle2FASubmit} className="space-y-5 animate-in fade-in">
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
                    if (useBackupCode) {
                      if (clean.replace(/-/g, '').length === 8) {
                        handle2FASubmit(undefined, clean);
                      }
                    } else if (clean.length === 6) {
                      handle2FASubmit(undefined, clean);
                    }
                  }}
                  placeholder={useBackupCode ? "1234-5678" : "000000"}
                  className="w-52 py-3.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-main)] text-center text-2xl tracking-[0.3em] font-bold focus:border-[var(--accent-primary)] outline-none shadow-inner font-mono"
                  autoFocus
                />
                <span className="text-[10px] text-[var(--text-muted)]">
                  {useBackupCode ? '비상 복구 코드 (8자리)' : '30초마다 갱신되는 6자리 번호'}
                </span>
              </div>

              {!useBackupCode && (
                <div className="grid grid-cols-3 gap-2" aria-label="OTP 숫자 키패드">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      disabled={loading}
                      onClick={() => handleOtpDigitPress(digit)}
                      className="h-12 rounded-xl bg-[var(--bg-primary)]/50 text-lg font-semibold text-[var(--text-main)] transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-50"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={loading || !totpInput}
                    onClick={() => { sound.playClick(); setTotpInput(''); setErrorMsg(null); }}
                    className="h-12 rounded-xl bg-[var(--bg-primary)]/50 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-40"
                  >
                    전체 삭제
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleOtpDigitPress('0')}
                    className="h-12 rounded-xl bg-[var(--bg-primary)]/50 text-lg font-semibold text-[var(--text-main)] transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-50"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    aria-label="마지막 숫자 지우기"
                    disabled={loading || !totpInput}
                    onClick={() => { sound.playClick(); setTotpInput((value) => value.slice(0, -1)); setErrorMsg(null); }}
                    className="flex h-12 items-center justify-center rounded-xl bg-[var(--bg-primary)]/50 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-40"
                  >
                    <Delete className="h-5 w-5" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between text-xs px-1">
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setTotpInput('');
                    sound.playClick();
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors text-[11px]"
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
                  className="text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1 text-[11px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>PIN 다시 입력</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || totpInput.length === 0}
                className="w-full py-3.5 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-xl shadow-[var(--accent-primary)]/20"
              >
                {loading ? '인증 중...' : '2FA 인증 완료 (Verify)'}
              </button>
            </form>
          ) : (
            /* ======================================================== */
            /* STEP 1: PIN / PASSWORD ENTRY                            */
            /* ======================================================== */
            <div className="space-y-5">
              
              {/* Initial PIN Guidance */}
              {isInitialPin && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <span className="font-bold block text-amber-200">초기 기본 PIN: [ 1234 ]</span>
                    키패드에 1234를 입력하여 잠금 해제할 수 있습니다. (로그인 후 즉시 변경 가능)
                  </div>
                </div>
              )}

              <p className="text-xs text-[var(--text-muted)]">비밀번호와 OTP로 로그인하세요. 로그인 정보는 앱이 자동으로 관리합니다.</p>

              {/* PIN Indicator or Password Input */}
              <div className="flex flex-col items-center justify-center py-1">
                {!useTextInput ? (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="flex items-center space-x-3.5 h-11 px-5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-inner">
                      {Array.from({ length: Math.max(4, pinInput.length) }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                            i < pinInput.length
                              ? 'bg-[var(--accent-primary)] scale-110 shadow-[0_0_10px_var(--accent-primary)]'
                              : 'bg-zinc-800 border border-zinc-700'
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
                      className="w-full pl-10 pr-10 py-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-main)] text-center text-sm tracking-widest placeholder-[var(--text-muted)] focus:border-[var(--accent-primary)] outline-none shadow-inner"
                      autoFocus
                    />
                    <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3.5" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Numeric PIN Pad Grid */}
              {!useTextInput && (
                <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleDigitPress(digit)}
                      className="h-13 py-3 rounded-2xl bg-[var(--bg-primary)]/80 hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] hover:border-[var(--border-hover)] text-xl font-bold text-[var(--text-main)] transition-all active:scale-95 flex items-center justify-center select-none shadow-sm"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleClearPin}
                    className="h-13 rounded-2xl bg-[var(--bg-primary)]/40 hover:bg-[var(--bg-surface-hover)] text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors flex items-center justify-center font-semibold select-none"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDigitPress('0')}
                    className="h-13 py-3 rounded-2xl bg-[var(--bg-primary)]/80 hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] hover:border-[var(--border-hover)] text-xl font-bold text-[var(--text-main)] transition-all active:scale-95 flex items-center justify-center select-none shadow-sm"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="h-13 rounded-2xl bg-[var(--bg-primary)]/40 hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex items-center justify-center select-none"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Session policy & Input Mode Toggle */}
              <div className="flex items-center justify-between px-1 text-[11px]">
                <span className="text-[var(--text-main)]">로그인 세션 24시간 유지</span>

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

              {/* Unlock Button */}
              <button
                type="button"
                onClick={() => handlePinSubmit()}
                disabled={loading || pinInput.length === 0}
                className="w-full py-3.5 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-xl shadow-[var(--accent-primary)]/20"
              >
                {loading ? '검증 중...' : '잠금 해제 (Unlock)'}
              </button>

            </div>
          )}

        </div>
      </div>

      {/* Bottom Footer Information */}
      <footer className="w-full max-w-5xl flex items-center justify-between text-[11px] text-[var(--text-muted)] z-10 py-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
          <span>Tier 1 Security Proxy & Vector DB Active</span>
        </div>
        <div>
          <span>모든 텔레메트리 및 시스템 제어는 안전하게 보호됩니다</span>
        </div>
      </footer>

    </div>
  );
};
