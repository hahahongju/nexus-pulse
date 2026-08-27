import React from 'react';
import { HardDrive, Zap, Database, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
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
      <div className="cyber-card p-5 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">PHYSICAL & VIRTUAL MEMORY</h3>
                <span className="text-xs text-slate-400 font-mono">RAM Allocation Breakdown</span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800 text-purple-300">
              {memory.usedPercent}% IN USE
            </span>
          </div>

          {/* Segmented Memory Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs font-mono text-slate-400 mb-1.5">
              <span>RAM Breakdown ({usedGb} GB / {totalGb} GB)</span>
              <span className="text-purple-400">{memory.usedPercent}%</span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex border border-slate-700/60">
              {/* Active */}
              <div 
                className="bg-purple-500 transition-all duration-500" 
                style={{ width: `${(memory.active / memory.total) * 100}%` }}
                title={`Active: ${activeGb} GB`}
              />
              {/* Buffer / Cache */}
              <div 
                className="bg-indigo-400 transition-all duration-500" 
                style={{ width: `${(memory.buffcache / memory.total) * 100}%` }}
                title={`Buffer/Cache: ${buffCacheGb} GB`}
              />
              {/* Free */}
              <div 
                className="bg-slate-800 transition-all duration-500" 
                style={{ width: `${(memory.free / memory.total) * 100}%` }}
                title={`Free: ${freeGb} GB`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 mt-2">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-500" />
                <span>Active ({activeGb} GB)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400" />
                <span>Buffers/Cache ({buffCacheGb} GB)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-700" />
                <span>Free ({freeGb} GB)</span>
              </span>
            </div>
          </div>

          {/* Swap Memory Bar */}
          <div className="pt-3 border-t border-slate-800/80">
            <div className="flex justify-between text-xs font-mono text-slate-400 mb-1.5">
              <span>SWAP Space ({swapUsedGb} GB / {swapTotalGb} GB)</span>
              <span className="text-cyan-400">{memory.swapPercent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700/60">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(memory.swapPercent > 0 ? 3 : 0, memory.swapPercent))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Detailed Stats Grid */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 font-mono text-xs text-center">
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
            <div className="text-slate-500 text-[10px]">AVAILABLE</div>
            <div className="text-slate-200 font-bold mt-0.5">{toGb(memory.available)} GB</div>
          </div>
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
            <div className="text-slate-500 text-[10px]">CACHED</div>
            <div className="text-indigo-300 font-bold mt-0.5">{buffCacheGb} GB</div>
          </div>
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
            <div className="text-slate-500 text-[10px]">SWAP FREE</div>
            <div className="text-cyan-300 font-bold mt-0.5">{toGb(memory.swapFree)} GB</div>
          </div>
        </div>
      </div>

      {/* 2. STORAGE & FILESYSTEM MOUNTS */}
      <div className="cyber-card p-5 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">STORAGE & DISK MOUNTS</h3>
                <span className="text-xs text-slate-400 font-mono">{disks.length} Partition(s) Detected</span>
              </div>
            </div>

            {/* Disk IO Speedometer */}
            <div className="flex items-center space-x-2 text-xs font-mono bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700">
              <span className="flex items-center text-emerald-400 font-bold">
                <ArrowDownCircle className="w-3.5 h-3.5 mr-1" />
                ↓ {formatSpeed(diskIO.rIO_sec)}
              </span>
              <span className="text-slate-600">|</span>
              <span className="flex items-center text-amber-400 font-bold">
                <ArrowUpCircle className="w-3.5 h-3.5 mr-1" />
                ↑ {formatSpeed(diskIO.wIO_sec)}
              </span>
            </div>
          </div>

          {/* Disk Partition List */}
          <div className="space-y-3 max-h-[190px] overflow-y-auto pr-1">
            {disks.map((disk, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/80 hover:border-slate-700 transition-colors">
                <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-cyan-300">{disk.mount}</span>
                    <span className="text-[10px] text-slate-500">({disk.type || disk.fs})</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-bold ${disk.usePercent > 85 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {disk.usePercent}%
                    </span>
                    <span className="text-slate-400 text-[11px] ml-1.5">
                      ({toGb(disk.used)} / {toGb(disk.size)} GB)
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${
                      disk.usePercent > 90 
                        ? 'bg-rose-500' 
                        : disk.usePercent > 75 
                        ? 'bg-amber-400' 
                        : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, disk.usePercent))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disk Summary */}
        <div className="mt-3 pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-400 flex justify-between">
          <span>Total Partitions: <strong className="text-slate-200">{disks.length}</strong></span>
          <span>Cumulative Disk I/O: <strong className="text-emerald-300">↓ {formatBytes(diskIO.rIO)}</strong> / <strong className="text-amber-300">↑ {formatBytes(diskIO.wIO)}</strong></span>
        </div>
      </div>

    </div>
  );
};
