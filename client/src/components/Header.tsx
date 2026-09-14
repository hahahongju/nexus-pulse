import React, { useEffect, useRef, useState } from 'react';
import { Settings, Shield, LogOut, Zap } from 'lucide-react';
import { SystemOverview, ThemeMode } from '../types/telemetry';
import { SecurityModal } from './SecurityModal';
import { authService } from '../services/auth';

interface HeaderProps {
  overview: SystemOverview | null;
  uptimeSec: number;
  isConnected: boolean;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  pollInterval: number;
  onPollIntervalChange: (interval: number) => void;
  onLock?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ overview, uptimeSec, isConnected, theme, onThemeChange, soundEnabled, onToggleSound, pollInterval, onPollIntervalChange, onLock }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && settingsOpen) { setSettingsOpen(false); settingsButton.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [settingsOpen]);

  const buttonStyle = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-2 sm:px-3 text-xs font-medium text-[var(--text-sub)] hover:text-[var(--text-main)] hover:border-[var(--border-hover)]';
  const hours = Math.floor(uptimeSec / 3600);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-[var(--border-color)] p-2 text-[var(--accent-primary)]"><Zap className="h-5 w-5" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-[var(--text-main)]">NexusPulse</h1>
            <p className="mt-1 flex items-center gap-2 text-xs text-[var(--text-sub)]">
              <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span>{overview?.hostname || '서버'} · {isConnected ? '연결됨' : '연결 확인 중'}</span>
              <span className="hidden sm:inline text-[var(--text-muted)]">가동 {Math.floor(hours / 24)}일 {hours % 24}시간</span>
            </p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:flex-none" ref={settingsRef}>
            <button ref={settingsButton} aria-expanded={settingsOpen} aria-controls="display-settings" onClick={() => setSettingsOpen(!settingsOpen)} className={`${buttonStyle} w-full`}><Settings className="h-4 w-4" />화면 설정</button>
            {settingsOpen && (
              <div id="display-settings" className="absolute left-0 top-full z-50 mt-2 w-64 space-y-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4 shadow-2xl sm:left-auto sm:right-0">
                <label className="block text-xs text-[var(--text-sub)]">화면 테마
                  <select value={theme} onChange={event => onThemeChange(event.target.value as ThemeMode)} className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-2 text-[var(--text-main)]">
                    <option value="cyber">시안</option><option value="matrix">에메랄드</option><option value="synthwave">로즈</option><option value="solar">앰버</option>
                  </select>
                </label>
                <label className="block text-xs text-[var(--text-sub)]">화면 갱신 주기
                  <select value={pollInterval} onChange={event => onPollIntervalChange(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-2 text-[var(--text-main)]">
                    <option value={500}>0.5초</option><option value={1000}>1초</option><option value={2000}>2초</option><option value={5000}>5초</option>
                  </select>
                </label>
                <button aria-pressed={soundEnabled} onClick={onToggleSound} className={`${buttonStyle} w-full`}>효과음 {soundEnabled ? '켜짐' : '꺼짐'}</button>
              </div>
            )}
          </div>
          <button onClick={() => { setSettingsOpen(false); setSecurityOpen(true); }} className={`${buttonStyle} flex-1 sm:flex-none`}><Shield className="h-4 w-4" />보안 설정</button>
          <button onClick={() => onLock ? onLock() : void authService.logout()} className={`${buttonStyle} flex-1 sm:flex-none`}><LogOut className="h-4 w-4" />로그아웃</button>
        </div>
      </div>
      <SecurityModal isOpen={securityOpen} onClose={() => setSecurityOpen(false)} initialTab="login" />
    </header>
  );
};
