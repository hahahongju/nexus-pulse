import React from 'react';
import { HardDrive, Layers, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { MemoryMetrics, DiskItem, DiskIO } from '../types/telemetry';
import { formatSpeed, formatBytes } from '../utils/formatters';

interface MemoryStorageViewProps {
  memory: MemoryMetrics;
  disks: DiskItem[];
  diskIO: DiskIO;
}

export const MemoryStorageView: React.FC<MemoryStorageViewProps> = ({ memory, disks, diskIO }) => {
  const toGb = (bytes: number) => (bytes / (1024 ** 3)).toFixed(2);

  const usedGb = toGb(memory.used);
  const activeGb = toGb(memory.active);
  const buffCacheGb = toGb(memory.buffcache);
  const freeGb = toGb(memory.free);
  const totalGb = toGb(memory.total);
  const swapUsedGb = toGb(memory.swapUsed);
  const swapTotalGb = toGb(memory.swapTotal);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      
      {/* 1. MEMORY & SWAP DETAILED ANALYSIS */}
      <div className="stitch-panel p-5 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-color)]">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)] font-mono">
                  Physical & Virtual Memory
                </h3>
                <span className="text-[11px] text-[var(--text-muted)] font-mono">Kernel Allocations & Buffers</span>
              </div>
            </div>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-[var(--text-main)] tabular-nums">
              {memory.usedPercent}% ALLOCATED
            </span>
          </div>

          {/* Segmented Memory Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs font-mono text-[var(--text-sub)] mb-1.5">
              <span>RAM Breakdown ({usedGb}G / {totalGb}G)</span>
              <span className="text-indigo-400 font-semibold tabular-nums">{memory.usedPercent}%</span>
            </div>
            <div className="w-full h-2.5 bg-zinc-800/80 rounded-full overflow-hidden flex border border-[var(--border-color)]">
              {/* Active */}
              <div 
                className="bg-indigo-500 transition-all duration-300" 
                style={{ width: `${(memory.active / memory.total) * 100}%` }}
                title={`Active: ${activeGb} GB`}
              />
              {/* Buffer / Cache */}
              <div 
                className="bg-cyan-500/80 transition-all duration-300" 
                style={{ width: `${(memory.buffcache / memory.total) * 100}%` }}
                title={`Buffer/Cache: ${buffCacheGb} GB`}
              />
              {/* Free */}
              <div 
                className="bg-zinc-800 transition-all duration-300" 
                style={{ width: `${(memory.free / memory.total) * 100}%` }}
                title={`Free: ${freeGb} GB`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-[var(--text-muted)] mt-2">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-sm bg-indigo-500" />
                <span>Active ({activeGb}G)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-sm bg-cyan-500/80" />
                <span>Buffers/Cache ({buffCacheGb}G)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-sm bg-zinc-700" />
                <span>Free ({freeGb}G)</span>
              </span>
            </div>
          </div>

          {/* Swap Memory Bar */}
          <div className="pt-3 border-t border-[var(--border-color)]">
            <div className="flex justify-between text-xs font-mono text-[var(--text-sub)] mb-1.5">
              <span>SWAP Space ({swapUsedGb}G / {swapTotalGb}G)</span>
              <span className="text-[var(--accent-primary)] font-semibold tabular-nums">{memory.swapPercent}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-800/80 rounded-full overflow-hidden border border-[var(--border-color)]">
              <div 
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(memory.swapPercent > 0 ? 2 : 0, memory.swapPercent))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Detailed Stats Grid */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[var(--border-color)] font-mono text-xs text-center">
          <div className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]">
            <div className="text-[var(--text-muted)] text-[10px] uppercase">Available</div>
            <div className="text-[var(--text-main)] font-semibold mt-0.5 tabular-nums">{toGb(memory.available)} GB</div>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]">
            <div className="text-[var(--text-muted)] text-[10px] uppercase">Cached</div>
            <div className="text-cyan-400 font-semibold mt-0.5 tabular-nums">{buffCacheGb} GB</div>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]">
            <div className="text-[var(--text-muted)] text-[10px] uppercase">Swap Free</div>
            <div className="text-[var(--text-sub)] font-semibold mt-0.5 tabular-nums">{toGb(memory.swapFree)} GB</div>
          </div>
        </div>
      </div>

      {/* 2. STORAGE & FILESYSTEM MOUNTS */}
      <div className="stitch-panel p-5 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-color)]">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)] font-mono">
                  Storage Partitions & Mounts
                </h3>
                <span className="text-[11px] text-[var(--text-muted)] font-mono">{disks.length} Volume(s) Online</span>
              </div>
            </div>

            {/* Disk IO Speedometer */}
            <div className="flex items-center space-x-2 text-xs font-mono bg-[var(--bg-primary)] px-2.5 py-1 rounded-md border border-[var(--border-color)]">
              <span className="flex items-center text-emerald-400 font-semibold tabular-nums">
                <ArrowUpCircle className="w-3.5 h-3.5 mr-1" />
                ↑ {formatSpeed(diskIO.rIO_sec)}
              </span>
              <span className="text-zinc-600">/</span>
              <span className="flex items-center text-amber-400 font-semibold tabular-nums">
                <ArrowDownCircle className="w-3.5 h-3.5 mr-1" />
                ↓ {formatSpeed(diskIO.wIO_sec)}
              </span>
            </div>
          </div>

          {/* Disk Partition List */}
          <div className="space-y-2.5 max-h-[190px] overflow-y-auto pr-1">
            {disks.map((disk, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] hover:border-[var(--border-hover)] transition-colors">
                <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-[var(--text-main)]">{disk.mount}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">({disk.type || disk.fs})</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-semibold tabular-nums ${disk.usePercent > 85 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {disk.usePercent}%
                    </span>
                    <span className="text-[var(--text-muted)] text-[11px] ml-1.5 tabular-nums">
                      ({toGb(disk.used)} / {toGb(disk.size)} GB)
                    </span>
                  </div>
                </div>

                <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden border border-[var(--border-color)]">
                  <div 
                    className={`h-full transition-all duration-300 rounded-full ${
                      disk.usePercent > 90 
                        ? 'bg-rose-500' 
                        : disk.usePercent > 75 
                        ? 'bg-amber-400' 
                        : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, disk.usePercent))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disk Summary */}
        <div className="mt-4 pt-3 border-t border-[var(--border-color)] text-[11px] font-mono text-[var(--text-muted)] flex justify-between">
          <span>Partitions: <strong className="text-[var(--text-main)]">{disks.length}</strong></span>
          <span>Cumulative I/O: <strong className="text-emerald-400 tabular-nums">↓ {formatBytes(diskIO.rIO)}</strong> / <strong className="text-amber-400 tabular-nums">↑ {formatBytes(diskIO.wIO)}</strong></span>
        </div>
      </div>

    </div>
  );
};
