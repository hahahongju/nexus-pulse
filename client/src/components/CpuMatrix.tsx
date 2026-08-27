import React from 'react';
import { Cpu, Flame, Gauge, Layers } from 'lucide-react';
import { CpuMetrics } from '../types/telemetry';

interface CpuMatrixProps {
  cpu: CpuMetrics;
  brand?: string;
  coresCount?: number;
  loadavg: number[];
}

export const CpuMatrix: React.FC<CpuMatrixProps> = ({ cpu, brand, coresCount, loadavg }) => {
  const cores = cpu.cores || [];

  const getCoreColor = (load: number) => {
    if (load > 85) return 'from-rose-500 to-red-600 border-rose-500/50 text-rose-300';
    if (load > 65) return 'from-amber-500 to-orange-600 border-amber-500/50 text-amber-300';
    if (load > 35) return 'from-cyan-500 to-teal-600 border-cyan-500/50 text-cyan-300';
    return 'from-emerald-500 to-cyan-600 border-emerald-500/40 text-emerald-300';
  };

  const getHeatmapBg = (load: number) => {
    if (load > 85) return 'bg-rose-500/20 border-rose-500/50';
    if (load > 65) return 'bg-amber-500/20 border-amber-500/50';
    if (load > 35) return 'bg-cyan-500/15 border-cyan-500/40';
    return 'bg-slate-800/40 border-slate-700/60';
  };

  return (
    <div className="cyber-card p-5">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">CPU MULTI-CORE TOPOLOGY</h2>
            <div className="text-xs text-slate-400 font-mono truncate max-w-sm">{brand || 'Processor Core Matrix'}</div>
          </div>
        </div>

        {/* Load Avg Pill */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-700">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Load Avg:</span>
            <span className="text-cyan-300 font-semibold">{loadavg[0]} (1m)</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">{loadavg[1]} (5m)</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">{loadavg[2]} (15m)</span>
          </div>

          {cpu.temperature?.main && (
            <div className="flex items-center space-x-1 bg-slate-900/80 px-2.5 py-1 rounded-md border border-amber-500/30 text-amber-300">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>{cpu.temperature.main}°C</span>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Core Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {cores.map((coreLoad, idx) => (
          <div 
            key={idx} 
            className={`p-3 rounded-lg border flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] ${getHeatmapBg(coreLoad)}`}
          >
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-slate-400 font-semibold">CORE #{idx}</span>
              <span className={`font-bold ${
                coreLoad > 85 ? 'text-rose-400' : coreLoad > 60 ? 'text-amber-400' : 'text-cyan-400'
              }`}>
                {coreLoad.toFixed(1)}%
              </span>
            </div>

            {/* Core Vertical Level Visualizer */}
            <div className="w-full bg-slate-950/80 h-2 rounded-full mt-2.5 overflow-hidden p-0.5 border border-slate-700/50">
              <div 
                className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${getCoreColor(coreLoad)}`}
                style={{ width: `${Math.min(100, Math.max(3, coreLoad))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Core Summary Stats Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400">
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
        <div className="text-slate-500">
          Total Cores: {cores.length || coresCount || 0}
        </div>
      </div>
    </div>
  );
};
