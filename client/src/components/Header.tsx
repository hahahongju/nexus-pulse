import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Server, 
  Cpu, 
  Volume2, 
  VolumeX, 
  Clock, 
  Zap, 
  Palette, 
  RefreshCw,
  Check,
  Radio
} from 'lucide-react';
import { SystemOverview, ThemeMode } from '../types/telemetry';
import { sound } from '../services/sound';
import { Tooltip } from './Tooltip';

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
}

export const Header: React.FC<HeaderProps> = ({
  overview,
  uptimeSec,
  isConnected,
  theme,
  onThemeChange,
  soundEnabled,
  onToggleSound,
  pollInterval,
  onPollIntervalChange,
}) => {
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setThemeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    return `${h}h ${m}m ${s}s`;
  };

  const themes: { id: ThemeMode; name: string; accentColor: string; label: string }[] = [
    { id: 'cyber', name: 'Cyber Obsidian', accentColor: '#06b6d4', label: 'Cyan / Deep Obsidian' },
    { id: 'matrix', name: 'Tactical Emerald', accentColor: '#10b981', label: 'Emerald / Night Forest' },
    { id: 'synthwave', name: 'Twilight Magenta', accentColor: '#ec4899', label: 'Rose / Midnight Violet' },
    { id: 'solar', name: 'Solar Horizon', accentColor: '#f59e0b', label: 'Amber / Warm Espresso' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-color)] px-4 sm:px-6 py-3 transition-colors">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
        
        {/* Brand & Host Identity */}
        <div className="flex items-center space-x-3.5">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-sm">
            <Zap className="w-5 h-5 text-[var(--accent-primary)] transition-transform duration-300 group-hover:scale-110" />
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 ring-2 ring-[var(--bg-primary)] animate-pulse' : 'bg-rose-500'}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-[var(--text-main)] uppercase font-mono">
                NexusPulse
              </h1>
              <span className="px-1.5 py-0.5 text-[9px] font-mono tracking-wider font-semibold rounded bg-[var(--accent-primary-muted)] text-[var(--accent-primary)] border border-[var(--border-color)]">
                STITCH TELEMETRY
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-[var(--text-muted)] font-mono mt-0.5">
              <Server className="w-3 h-3 text-[var(--accent-primary)]" />
              <span className="text-[var(--text-main)] font-medium">{overview?.hostname || 'Connecting...'}</span>
              <span>•</span>
              <span>{overview?.type} ({overview?.arch})</span>
            </div>
          </div>
        </div>

        {/* Action & Metric Controls */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          
          {/* Live Status Pill */}
          <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold transition-all ${
            isConnected 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
            <span className="tracking-wide">{isConnected ? 'LIVE 1Hz' : 'DISCONNECTED'}</span>
          </div>

          {/* Uptime Chip */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)]">
            <Clock className="w-3 h-3 text-[var(--text-muted)]" />
            <span className="text-[var(--text-muted)] text-[10px] uppercase">UPTIME</span>
            <span className="font-semibold text-[var(--accent-primary)] tabular-nums">{formatUptime(uptimeSec)}</span>
          </div>

          {/* Hardware CPU Spec */}
          {overview?.cpu && (
            <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)]">
              <Cpu className="w-3 h-3 text-[var(--text-muted)]" />
              <span className="truncate max-w-[190px] text-[var(--text-sub)]">{overview.cpu.brand}</span>
              <span className="text-[var(--accent-primary)] font-semibold">[{overview.cpu.cores}C]</span>
            </div>
          )}

          {/* Polling Interval Selector */}
          <Tooltip content="실시간 텔레메트리 갱신 주기">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-sub)]">
              <RefreshCw className="w-3 h-3 text-[var(--accent-primary)]" />
              <select
                value={pollInterval}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onPollIntervalChange(val);
                  sound.playClick();
                }}
                aria-label="텔레메트리 갱신 주기 선택"
                className="bg-transparent text-xs text-[var(--text-main)] outline-none cursor-pointer font-medium"
              >
                <option value={500} className="bg-zinc-900 text-zinc-100">500ms (Fast)</option>
                <option value={1000} className="bg-zinc-900 text-zinc-100">1.0s (Normal)</option>
                <option value={2000} className="bg-zinc-900 text-zinc-100">2.0s (Smooth)</option>
                <option value={5000} className="bg-zinc-900 text-zinc-100">5.0s (Eco)</option>
              </select>
            </div>
          </Tooltip>

          {/* Sound Synthesizer Audio Toggle */}
          <Tooltip content={soundEnabled ? "신디사이저 오디오 끄기 (Mute)" : "신디사이저 오디오 켜기 (Enable Audio)"}>
            <button
              onClick={() => {
                onToggleSound();
                sound.playClick();
              }}
              aria-label={soundEnabled ? "신디사이저 오디오 끄기" : "신디사이저 오디오 켜기"}
              className={`p-1.5 rounded-md border transition-all ${
                soundEnabled
                  ? 'bg-[var(--accent-primary-muted)] border-[var(--border-focus)] text-[var(--accent-primary)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </Tooltip>

          {/* Theme Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <Tooltip content="대시보드 테마 변경">
              <button
                onClick={() => {
                  setThemeDropdownOpen(!themeDropdownOpen);
                  sound.playClick();
                }}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-sub)] hover:border-[var(--border-hover)] transition-colors"
              >
                <Palette className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span className="capitalize font-medium">{theme}</span>
              </button>
            </Tooltip>

            {themeDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] backdrop-blur-2xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider border-b border-[var(--border-color)] mb-1">
                  Color Themes
                </div>
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onThemeChange(t.id);
                      setThemeDropdownOpen(false);
                      sound.playTabSwitch();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${
                      theme === t.id 
                        ? 'bg-[var(--accent-primary-muted)] text-[var(--accent-primary)] font-semibold' 
                        : 'text-[var(--text-sub)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.accentColor }} />
                      <span>{t.name}</span>
                    </div>
                    {theme === t.id && <Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
