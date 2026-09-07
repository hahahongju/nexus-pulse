import React from 'react';
import { Cpu, Flame, Gauge } from 'lucide-react';
import { CpuMetrics } from '../types/telemetry';

interface CpuMatrixProps {
  cpu: CpuMetrics;
  brand?: string;
  coresCount?: number;
  loadavg: number[];
}

export const CpuMatrix: React.FC<CpuMatrixProps> = ({ cpu, brand, coresCount, loadavg }) => {
  const cores = cpu.cores || [];

  const getCoreColorClass = (load: number) => {
    if (load > 85) return 'bg-rose-500';
    if (load > 65) return 'bg-amber-400';
    if (load > 35) return 'bg-cyan-500';
    return 'bg-emerald-400';
  };

  const getCoreBg = (load: number) => {
    if (load > 85) return 'bg-rose-500/10 border-rose-500/40 text-rose-300';
    if (load > 65) return 'bg-amber-500/10 border-amber-500/40 text-amber-300';
    if (load > 35) return 'bg-cyan-500/5 border-cyan-500/30 text-cyan-300';
    return 'bg-[var(--bg-surface)] border-[var(--border-color)] text-zinc-300';
  };

  return (
    <div className="stitch-panel p-5">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-md bg-[var(--accent-primary-muted)] border border-[var(--border-color)] text-[var(--accent-primary)]">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)] font-mono">
              Multi-Core Compute Topology
            </h2>
            <div className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-sm">
              {brand || 'Dynamic Core Processor Matrix'}
            </div>
          </div>
        </div>

        {/* Load Avg Pill */}
        <div className="flex items-center space-x-2 text-xs font-mono">
          <div className="flex items-center space-x-1.5 bg-[var(--bg-primary)] px-2.5 py-1 rounded-md border border-[var(--border-color)]">
            <Gauge className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span className="text-[var(--text-muted)] text-[10px] uppercase">Load:</span>
            <span className="text-[var(--text-main)] font-semibold tabular-nums">{loadavg[0]}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-[var(--text-sub)] tabular-nums">{loadavg[1]}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-[var(--text-muted)] tabular-nums">{loadavg[2]}</span>
          </div>

          {cpu.temperature?.main && (
            <div className="flex items-center space-x-1 bg-[var(--bg-primary)] px-2.5 py-1 rounded-md border border-amber-500/30 text-amber-400">
              <Flame className="w-3.5 h-3.5" />
              <span className="tabular-nums font-semibold">{cpu.temperature.main}°C</span>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Core Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {cores.map((coreLoad, idx) => (
          <div 
            key={idx} 
            className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all duration-200 hover:border-[var(--border-hover)] ${getCoreBg(coreLoad)}`}
          >
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-[10px] text-[var(--text-muted)] font-medium">CORE #{idx.toString().padStart(2, '0')}</span>
              <span className={`font-bold tabular-nums ${
                coreLoad > 85 ? 'text-rose-400' : coreLoad > 65 ? 'text-amber-400' : 'text-[var(--text-main)]'
              }`}>
                {coreLoad.toFixed(1)}%
              </span>
            </div>

            {/* Micro Bar */}
            <div className="w-full bg-zinc-800/80 h-1.5 rounded-full mt-2 overflow-hidden p-0">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${getCoreColorClass(coreLoad)}`}
                style={{ width: `${Math.min(100, Math.max(2, coreLoad))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Core Summary Stats Footer */}
      <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex flex-wrap items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Idle (&lt;35%)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Normal (35-65%)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>High (65-85%)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Critical (&gt;85%)</span>
          </span>
        </div>
        <div className="text-[var(--text-sub)]">
          Total Detected: <span className="text-[var(--text-main)] font-semibold">{cores.length || coresCount || 0}</span> Cores
        </div>
      </div>
    </div>
  );
};
