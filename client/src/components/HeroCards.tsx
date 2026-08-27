import React from 'react';
import { Cpu, HardDrive, Network, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { SystemMetrics, HistoryPoint } from '../types/telemetry';
import { formatSpeed } from '../utils/formatters';

interface HeroCardsProps {
  metrics: SystemMetrics | null;
  history: HistoryPoint[];
}

export const HeroCards: React.FC<HeroCardsProps> = ({ metrics, history }) => {
  if (!metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="cyber-card p-5 animate-pulse flex flex-col justify-between h-36">
            <div className="h-4 bg-slate-800 rounded w-1/3"></div>
            <div className="h-8 bg-slate-800 rounded w-1/2"></div>
            <div className="h-3 bg-slate-800 rounded w-full"></div>
          </div>
        ))}
      </div>
    );
  }

  const cpu = metrics.cpu.usage;
  const ram = metrics.memory.usedPercent;
  const rootDisk = metrics.storage.disks.find((d) => d.mount === '/') || metrics.storage.disks[0];
  const diskPercent = rootDisk ? rootDisk.usePercent : 0;
  const netRxKb = Math.round((metrics.network.io.rx_sec / 1024) * 10) / 10;
  const netTxKb = Math.round((metrics.network.io.tx_sec / 1024) * 10) / 10;

  // Mini sparkline SVG generator
  const renderSparkline = (dataPoints: number[], color: string, height = 32) => {
    if (dataPoints.length < 2) return null;
    const width = 120;
    const max = Math.max(...dataPoints, 100);
    const min = 0;
    const pts = dataPoints.map((val, idx) => {
      const x = (idx / (dataPoints.length - 1)) * width;
      const y = height - ((val - min) / (max - min || 1)) * (height - 4) - 2;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#grad-${color})`} />
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      </svg>
    );
  };

  const recentCpu = history.slice(-20).map((h) => h.cpu);
  const recentRam = history.slice(-20).map((h) => h.ram);
  const recentNet = history.slice(-20).map((h) => h.netRx + h.netTx);
  const recentDisk = history.slice(-20).map((h) => h.diskRead + h.diskWrite);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      
      {/* 1. CPU HERO CARD */}
      <div className={`cyber-card p-4 relative overflow-hidden group ${
        cpu > 85 ? 'border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.3)]' : ''
      }`}>
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">CPU UTILIZATION</span>
              <div className="text-xs text-slate-500 font-mono">Load: {metrics.loadavg.join(', ')}</div>
            </div>
          </div>
          <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
            cpu > 85 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 
            cpu > 60 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 
            'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
          }`}>
            {metrics.cpu.cores.length} CORES
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-3xl font-extrabold font-mono tracking-tight text-white flex items-baseline space-x-1">
              <span className={cpu > 85 ? 'text-rose-400' : cpu > 60 ? 'text-amber-400' : 'text-cyan-400'}>
                {cpu.toFixed(1)}
              </span>
              <span className="text-sm font-normal text-slate-400">%</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              1m Load Avg: <span className="text-slate-200 font-semibold">{metrics.loadavg[0]}</span>
            </div>
          </div>
          <div className="opacity-80 group-hover:opacity-100 transition-opacity">
            {renderSparkline(recentCpu, cpu > 85 ? '#f43f5e' : '#00f0ff')}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 rounded-full ${
              cpu > 85 ? 'bg-rose-500' : cpu > 60 ? 'bg-amber-400' : 'bg-gradient-to-r from-cyan-500 to-teal-400'
            }`}
            style={{ width: `${Math.min(100, Math.max(2, cpu))}%` }}
          />
        </div>
      </div>

      {/* 2. RAM HERO CARD */}
      <div className={`cyber-card p-4 relative overflow-hidden group ${
        ram > 90 ? 'border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.3)]' : ''
      }`}>
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">MEMORY (RAM)</span>
              <div className="text-xs text-slate-500 font-mono">
                Swap: {metrics.memory.swapPercent}%
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
            {(metrics.memory.total / (1024 ** 3)).toFixed(1)} GB TOTAL
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-3xl font-extrabold font-mono tracking-tight text-white flex items-baseline space-x-1">
              <span className={ram > 90 ? 'text-rose-400' : ram > 75 ? 'text-amber-400' : 'text-purple-400'}>
                {ram.toFixed(1)}
              </span>
              <span className="text-sm font-normal text-slate-400">%</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              Used: <span className="text-slate-200">{(metrics.memory.used / (1024 ** 3)).toFixed(2)} GB</span> / Avail: {(metrics.memory.available / (1024 ** 3)).toFixed(2)} GB
            </div>
          </div>
          <div className="opacity-80 group-hover:opacity-100 transition-opacity">
            {renderSparkline(recentRam, '#a855f7')}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 rounded-full ${
              ram > 90 ? 'bg-rose-500' : ram > 75 ? 'bg-amber-400' : 'bg-gradient-to-r from-purple-500 to-pink-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(2, ram))}%` }}
          />
        </div>
      </div>

      {/* 3. DISK STORAGE CARD */}
      <div className="cyber-card p-4 relative overflow-hidden group">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ROOT STORAGE</span>
              <div className="text-xs text-slate-500 font-mono">
                Mount: {rootDisk ? rootDisk.mount : '/'}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            {rootDisk ? (rootDisk.size / (1024 ** 3)).toFixed(0) : '0'} GB
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-3xl font-extrabold font-mono tracking-tight text-white flex items-baseline space-x-1">
              <span className={diskPercent > 90 ? 'text-rose-400' : 'text-emerald-400'}>
                {diskPercent.toFixed(1)}
              </span>
              <span className="text-sm font-normal text-slate-400">%</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              Free: <span className="text-slate-200">{rootDisk ? (rootDisk.available / (1024 ** 3)).toFixed(1) : 0} GB</span> | I/O: <span className="text-emerald-300 font-bold">{formatSpeed(metrics.storage.io.rIO_sec + metrics.storage.io.wIO_sec)}</span>
            </div>
          </div>
          <div className="opacity-80 group-hover:opacity-100 transition-opacity">
            {renderSparkline(recentDisk, '#10b981')}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(2, diskPercent))}%` }}
          />
        </div>
      </div>

      {/* 4. NETWORK BANDWIDTH CARD */}
      <div className="cyber-card p-4 relative overflow-hidden group">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-pink-500/10 border border-pink-500/30 text-pink-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">NETWORK I/O</span>
              <div className="text-xs text-slate-500 font-mono">
                {metrics.network.interfaces.length} active iface(s)
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-pink-500/10 text-pink-400 border border-pink-500/30">
            TOTAL RX/TX
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-2xl font-extrabold font-mono tracking-tight text-white flex items-baseline space-x-2">
              <span className="text-cyan-400 text-lg font-bold">↓{formatSpeed(metrics.network.io.rx_sec)}</span>
              <span className="text-pink-400 text-lg font-bold">↑{formatSpeed(metrics.network.io.tx_sec)}</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              Accumulated: {(metrics.network.io.total_rx / (1024 ** 2)).toFixed(1)}MB Rx / {(metrics.network.io.total_tx / (1024 ** 2)).toFixed(1)}MB Tx
            </div>
          </div>
          <div className="opacity-80 group-hover:opacity-100 transition-opacity">
            {renderSparkline(recentNet, '#ec4899')}
          </div>
        </div>

        {/* Progress Bar (normalized) */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden flex">
          <div 
            className="h-full bg-cyan-400 transition-all duration-300"
            style={{ width: `${Math.min(50, (netRxKb / 500) * 50)}%` }}
          />
          <div 
            className="h-full bg-pink-500 transition-all duration-300"
            style={{ width: `${Math.min(50, (netTxKb / 500) * 50)}%` }}
          />
        </div>
      </div>

    </div>
  );
};
