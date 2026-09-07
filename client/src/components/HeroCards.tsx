import React from 'react';
import { Cpu, HardDrive, Network, Layers, ArrowDown, ArrowUp, Activity } from 'lucide-react';
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
          <div key={n} className="stitch-panel p-5 animate-pulse flex flex-col justify-between h-36">
            <div className="h-4 bg-zinc-800/60 rounded w-1/3"></div>
            <div className="h-8 bg-zinc-800/60 rounded w-1/2"></div>
            <div className="h-2 bg-zinc-800/60 rounded w-full"></div>
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

  // Stitch High-Precision Micro Sparkline
  const renderSparkline = (dataPoints: number[], color: string, id: string, height = 34) => {
    if (dataPoints.length < 2) return null;
    const width = 110;
    const maxVal = Math.max(...dataPoints, 10);
    const minVal = Math.min(...dataPoints, 0);
    const range = maxVal - minVal || 1;

    const coords = dataPoints.map((val, idx) => {
      const x = (idx / (dataPoints.length - 1)) * width;
      const y = height - ((val - minVal) / range) * (height - 6) - 3;
      return { x, y };
    });

    const ptsString = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const lastCoord = coords[coords.length - 1];

    return (
      <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polygon 
          points={`0,${height} ${ptsString} ${width},${height}`} 
          fill={`url(#grad-${id})`} 
        />
        <polyline 
          fill="none" 
          stroke={color} 
          strokeWidth="1.75" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          points={ptsString} 
        />
        {lastCoord && (
          <circle 
            cx={lastCoord.x} 
            cy={lastCoord.y} 
            r="2.5" 
            fill={color} 
            className="animate-pulse"
          />
        )}
      </svg>
    );
  };

  const recentCpu = history.slice(-20).map((h) => h.cpu);
  const recentRam = history.slice(-20).map((h) => h.ram);
  const recentNet = history.slice(-20).map((h) => h.netRx + h.netTx);
  const recentDisk = history.slice(-20).map((h) => h.diskRead + h.diskWrite);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      
      {/* 1. CPU LOAD PANEL */}
      <div className={`stitch-panel p-4 relative overflow-hidden group transition-all ${
        cpu > 85 ? 'border-rose-500/50' : cpu > 65 ? 'border-amber-500/40' : ''
      }`}>
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-lg border transition-colors ${
              cpu > 85 
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
                : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
            }`}>
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                CPU Compute Load
              </span>
              <div className="text-[10px] text-[var(--text-sub)] font-mono">
                LoadAvg: {metrics.loadavg.slice(0, 3).join(' / ')}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            {metrics.cpu.cores.length}C
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-[var(--text-main)] flex items-baseline space-x-1 tabular-nums">
              <span className={cpu > 85 ? 'text-rose-400' : cpu > 65 ? 'text-amber-400' : 'text-cyan-400'}>
                {cpu.toFixed(1)}
              </span>
              <span className="text-xs font-normal text-[var(--text-muted)]">%</span>
            </div>
            <div className="text-[10px] text-[var(--text-sub)] font-mono mt-0.5">
              1m: <span className="text-[var(--text-main)] font-semibold">{metrics.loadavg[0]}</span> | 5m: {metrics.loadavg[1]}
            </div>
          </div>
          <div className="opacity-90 group-hover:opacity-100 transition-opacity">
            {renderSparkline(recentCpu, cpu > 85 ? '#f43f5e' : '#06b6d4', 'cpu')}
          </div>
        </div>

        {/* Linear Gauge */}
        <div className="w-full bg-zinc-800/70 h-1 rounded-full mt-3 overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 rounded-full ${
              cpu > 85 ? 'bg-rose-500' : cpu > 65 ? 'bg-amber-400' : 'bg-cyan-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(2, cpu))}%` }}
          />
        </div>
      </div>

      {/* 2. RAM ALLOCATION PANEL */}
      <div className={`stitch-panel p-4 relative overflow-hidden group transition-all ${
        ram > 90 ? 'border-rose-500/50' : ram > 75 ? 'border-amber-500/40' : ''
      }`}>
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                Memory Workspace
              </span>
              <div className="text-[10px] text-[var(--text-sub)] font-mono">
                Swap: {metrics.memory.swapPercent.toFixed(1)}%
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            {(metrics.memory.total / (1024 ** 3)).toFixed(1)} GB
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-[var(--text-main)] flex items-baseline space-x-1 tabular-nums">
              <span className={ram > 90 ? 'text-rose-400' : ram > 75 ? 'text-amber-400' : 'text-indigo-400'}>
                {ram.toFixed(1)}
              </span>
              <span className="text-xs font-normal text-[var(--text-muted)]">%</span>
            </div>
            <div className="text-[10px] text-[var(--text-sub)] font-mono mt-0.5">
              Used: <span className="text-[var(--text-main)] font-semibold">{(metrics.memory.used / (1024 ** 3)).toFixed(1)}G</span> / Avail: {(metrics.memory.available / (1024 ** 3)).toFixed(1)}G
            </div>
          </div>
          <div className="opacity-90 group-hover:opacity-100 transition-opacity">
            {renderSparkline(recentRam, ram > 90 ? '#f43f5e' : '#818cf8', 'ram')}
          </div>
        </div>

        {/* Linear Gauge */}
        <div className="w-full bg-zinc-800/70 h-1 rounded-full mt-3 overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 rounded-full ${
              ram > 90 ? 'bg-rose-500' : ram > 75 ? 'bg-amber-400' : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(2, ram))}%` }}
          />
        </div>
      </div>

      {/* 3. STORAGE I/O PANEL */}
      <div className={`stitch-panel p-4 relative overflow-hidden group transition-all ${
        diskPercent > 90 ? 'border-rose-500/50' : ''
      }`}>
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                Root Filesystem
              </span>
              <div className="text-[10px] text-[var(--text-sub)] font-mono">
                Mount: {rootDisk ? rootDisk.mount : '/'}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            {rootDisk ? (rootDisk.size / (1024 ** 3)).toFixed(0) : '0'} GB
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-[var(--text-main)] flex items-baseline space-x-1 tabular-nums">
              <span className={diskPercent > 90 ? 'text-rose-400' : 'text-emerald-400'}>
                {diskPercent.toFixed(1)}
              </span>
              <span className="text-xs font-normal text-[var(--text-muted)]">%</span>
            </div>
            <div className="text-[10px] text-[var(--text-sub)] font-mono mt-0.5">
              Free: <span className="text-[var(--text-main)] font-semibold">{rootDisk ? (rootDisk.available / (1024 ** 3)).toFixed(1) : 0}G</span> | IOPS: <span className="text-emerald-400 font-medium">{formatSpeed(metrics.storage.io.rIO_sec + metrics.storage.io.wIO_sec)}</span>
            </div>
          </div>
          <div className="opacity-90 group-hover:opacity-100 transition-opacity">
            {renderSparkline(recentDisk, '#10b981', 'disk')}
          </div>
        </div>

        {/* Linear Gauge */}
        <div className="w-full bg-zinc-800/70 h-1 rounded-full mt-3 overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
            style={{ width: `${Math.min(100, Math.max(2, diskPercent))}%` }}
          />
        </div>
      </div>

      {/* 4. NETWORK TELEMETRY PANEL */}
      <div className="stitch-panel p-4 relative overflow-hidden group transition-all">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                Network Bandwidth
              </span>
              <div className="text-[10px] text-[var(--text-sub)] font-mono">
                {metrics.network.interfaces.length} iface(s) active
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            TOTAL RX/TX
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-xl font-bold font-mono tracking-tight text-[var(--text-main)] flex items-center space-x-2 tabular-nums">
              <span className="text-cyan-400 flex items-center text-sm font-semibold">
                <ArrowDown className="w-3.5 h-3.5 mr-0.5" />
                {formatSpeed(metrics.network.io.rx_sec)}
              </span>
              <span className="text-emerald-400 flex items-center text-sm font-semibold">
                <ArrowUp className="w-3.5 h-3.5 mr-0.5" />
                {formatSpeed(metrics.network.io.tx_sec)}
              </span>
            </div>
            <div className="text-[10px] text-[var(--text-sub)] font-mono mt-1">
              Acc: {(metrics.network.io.total_rx / (1024 ** 2)).toFixed(0)}M Rx • {(metrics.network.io.total_tx / (1024 ** 2)).toFixed(0)}M Tx
            </div>
          </div>
          <div className="opacity-90 group-hover:opacity-100 transition-opacity">
            {renderSparkline(recentNet, '#14b8a6', 'net')}
          </div>
        </div>

        {/* Dual Bandwidth Gauge */}
        <div className="w-full bg-zinc-800/70 h-1 rounded-full mt-3 overflow-hidden flex">
          <div 
            className="h-full bg-cyan-400 transition-all duration-300"
            style={{ width: `${Math.min(50, (netRxKb / 500) * 50)}%` }}
          />
          <div 
            className="h-full bg-emerald-400 transition-all duration-300"
            style={{ width: `${Math.min(50, (netTxKb / 500) * 50)}%` }}
          />
        </div>
      </div>

    </div>
  );
};
