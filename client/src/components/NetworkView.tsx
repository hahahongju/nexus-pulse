import React from 'react';
import { Network, ArrowDown, ArrowUp, Wifi } from 'lucide-react';
import { NetworkIO, NetworkInterfaceMetric } from '../types/telemetry';
import { formatSpeed, formatBytes } from '../utils/formatters';

interface NetworkViewProps {
  networkIO: NetworkIO;
  interfaces: NetworkInterfaceMetric[];
}

export const NetworkView: React.FC<NetworkViewProps> = ({ networkIO, interfaces }) => {
  const rx = formatSpeed(networkIO.rx_sec);
  const tx = formatSpeed(networkIO.tx_sec);

  return (
    <div className="stitch-panel p-5">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-md bg-teal-500/10 border border-teal-500/20 text-teal-400">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)] font-mono">
              Network Traffic & Active Interfaces
            </h3>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">Real-time socket packet stream</span>
          </div>
        </div>

        {/* Aggregate Bandwidth Speedometer */}
        <div className="flex items-center space-x-2 font-mono text-xs">
          <div className="flex items-center space-x-1.5 bg-[var(--bg-primary)] px-3 py-1.5 rounded-md border border-[var(--border-color)]">
            <ArrowDown className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[var(--text-muted)] text-[10px] uppercase">RX:</span>
            <span className="text-xs font-bold text-cyan-400 tabular-nums">{rx}</span>
          </div>

          <div className="flex items-center space-x-1.5 bg-[var(--bg-primary)] px-3 py-1.5 rounded-md border border-[var(--border-color)]">
            <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[var(--text-muted)] text-[10px] uppercase">TX:</span>
            <span className="text-xs font-bold text-emerald-400 tabular-nums">{tx}</span>
          </div>
        </div>
      </div>

      {/* Interface Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {interfaces.length === 0 ? (
          <div className="col-span-full py-8 text-center text-xs font-mono text-[var(--text-muted)]">
            No network interfaces reporting statistics
          </div>
        ) : (
          interfaces.map((iface, idx) => {
            const ifaceRx = formatSpeed(iface.rx_sec);
            const ifaceTx = formatSpeed(iface.tx_sec);
            const isUp = iface.operstate === 'up' || iface.operstate === 'unknown';

            return (
              <div key={idx} className="p-3.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] hover:border-[var(--border-hover)] transition-all">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center space-x-2">
                    <Wifi className={`w-4 h-4 ${isUp ? 'text-teal-400' : 'text-zinc-600'}`} />
                    <span className="font-mono font-bold text-[var(--text-main)] text-sm">{iface.iface}</span>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded ${
                    isUp ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {iface.operstate?.toUpperCase() || 'UP'}
                  </span>
                </div>

                <div className="space-y-1.5 font-mono text-xs pt-2 border-t border-[var(--border-color)]">
                  <div className="flex justify-between items-center text-[var(--text-muted)]">
                    <span className="flex items-center text-cyan-400">
                      <ArrowDown className="w-3 h-3 mr-1" />
                      Rx Speed:
                    </span>
                    <span className="text-[var(--text-main)] font-semibold tabular-nums">{ifaceRx}</span>
                  </div>

                  <div className="flex justify-between items-center text-[var(--text-muted)]">
                    <span className="flex items-center text-emerald-400">
                      <ArrowUp className="w-3 h-3 mr-1" />
                      Tx Speed:
                    </span>
                    <span className="text-[var(--text-main)] font-semibold tabular-nums">{ifaceTx}</span>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] pt-1 border-t border-zinc-800/40">
                    <span>Rx: {formatBytes(iface.rx_bytes)}</span>
                    <span>Tx: {formatBytes(iface.tx_bytes)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
