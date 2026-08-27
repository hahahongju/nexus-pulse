import React, { useState, useEffect } from 'react';
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
  Layers
} from 'lucide-react';
import { SystemOverview, ThemeMode } from '../types/telemetry';
import { sound } from '../services/sound';
import { wsClient } from '../services/websocket';

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

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    return `${h}h ${m}m ${s}s`;
  };

  const themes: { id: ThemeMode; name: string; color: string; icon: string }[] = [
    { id: 'cyber', name: 'Cyber Neon', color: '#00f0ff', icon: '⚡' },
    { id: 'matrix', name: 'Matrix Green', color: '#10b981', icon: '🟢' },
    { id: 'synthwave', name: 'Synthwave', color: '#ec4899', icon: '🌸' },
    { id: 'solar', name: 'Solar Flare', color: '#f59e0b', icon: '🔥' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#080c14]/90 backdrop-blur-md border-b border-cyan-500/20 px-4 py-3 shadow-lg">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
        
        {/* Brand & Hostname */}
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/40 shadow-inner">
            <Zap className="w-6 h-6 text-cyan-400 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#080c14] animate-ping" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-extrabold tracking-wider bg-gradient-to-r from-cyan-400 via-teal-300 to-purple-400 bg-clip-text text-transparent uppercase">
                NexusPulse
              </h1>
              <span className="px-1.5 py-0.5 text-[10px] font-mono tracking-wide rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800">
                OS TELEMETRY
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
              <Server className="w-3 h-3 text-cyan-400" />
              <span className="text-slate-200 font-semibold">{overview?.hostname || 'Connecting...'}</span>
              <span>•</span>
              <span className="text-slate-400">{overview?.type} {overview?.arch}</span>
            </div>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          
          {/* WS Status */}
          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border ${
            isConnected 
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400' 
              : 'bg-rose-950/40 border-rose-500/40 text-rose-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span>{isConnected ? 'LIVE STREAM' : 'DISCONNECTED'}</span>
          </div>

          {/* Uptime */}
          <div className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-700/60 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">UP:</span>
            <span className="font-semibold text-cyan-300">{formatUptime(uptimeSec)}</span>
          </div>

          {/* CPU Spec Badge */}
          {overview?.cpu && (
            <div className="hidden lg:flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-700/60 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span className="truncate max-w-[180px]">{overview.cpu.brand}</span>
              <span className="text-purple-300">({overview.cpu.cores}C)</span>
            </div>
          )}

          {/* Polling Interval Selector */}
          <div className="flex items-center space-x-1 px-2 py-1 rounded-md bg-slate-900/80 border border-slate-700/60 text-slate-300">
            <RefreshCw className="w-3 h-3 text-cyan-400" />
            <select
              value={pollInterval}
              onChange={(e) => {
                const val = Number(e.target.value);
                onPollIntervalChange(val);
                sound.playClick();
              }}
              className="bg-transparent text-xs text-cyan-300 outline-none cursor-pointer"
            >
              <option value={500} className="bg-slate-900 text-slate-200">500ms (Hyper)</option>
              <option value={1000} className="bg-slate-900 text-slate-200">1.0s (Normal)</option>
              <option value={2000} className="bg-slate-900 text-slate-200">2.0s (Smooth)</option>
              <option value={5000} className="bg-slate-900 text-slate-200">5.0s (Eco)</option>
            </select>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              onToggleSound();
              sound.playClick();
            }}
            className={`p-1.5 rounded-md border transition-all ${
              soundEnabled
                ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-400 hover:bg-cyan-900/60'
                : 'bg-slate-900/80 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'Mute Telemetry Sound' : 'Enable Telemetry Audio'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Theme Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setThemeDropdownOpen(!themeDropdownOpen);
                sound.playClick();
              }}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-700/60 text-slate-300 hover:border-cyan-500/40 transition-colors"
            >
              <Palette className="w-3.5 h-3.5 text-cyan-400" />
              <span className="capitalize">{theme}</span>
            </button>

            {themeDropdownOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-lg bg-slate-900/95 border border-cyan-500/30 backdrop-blur-xl shadow-2xl py-1 z-50">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onThemeChange(t.id);
                      setThemeDropdownOpen(false);
                      sound.playTabSwitch();
                    }}
                    className={`w-full flex items-center space-x-2 px-3 py-1.5 text-xs text-left hover:bg-cyan-500/10 transition-colors ${
                      theme === t.id ? 'text-cyan-400 font-bold bg-cyan-950/30' : 'text-slate-300'
                    }`}
                  >
                    <span>{t.icon}</span>
                    <span>{t.name}</span>
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
