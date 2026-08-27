import React from 'react';
import { Network, ArrowDown, ArrowUp, Globe, Radio, Wifi } from 'lucide-react';
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
    <div className="cyber-card p-5">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-pink-500/10 border border-pink-500/30 text-pink-400">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">NETWORK TRAFFIC & INTERFACES</h3>
            <span className="text-xs text-slate-400 font-mono">Real-time socket packet stream</span>
          </div>
        </div>

        {/* Aggregate Bandwidth Speedometer */}
        <div className="flex items-center space-x-4 font-mono text-xs">
          <div className="flex items-center space-x-1.5 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300">
            <ArrowDown className="w-4 h-4 text-cyan-400 animate-bounce" />
            <span>RX (Down):</span>
            <span className="text-sm font-bold text-white">{rx}</span>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-pink-500/30 text-pink-300">
            <ArrowUp className="w-4 h-4 text-pink-400 animate-bounce" />
            <span>TX (Up):</span>
            <span className="text-sm font-bold text-white">{tx}</span>
          </div>
        </div>
      </div>

      {/* Interface Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {interfaces.length === 0 ? (
          <div className="col-span-full py-8 text-center text-xs font-mono text-slate-500">
            No network interfaces reporting statistics
          </div>
        ) : (
          interfaces.map((iface, idx) => {
            const ifaceRx = formatSpeed(iface.rx_sec);
            const ifaceTx = formatSpeed(iface.tx_sec);
            const isUp = iface.operstate === 'up' || iface.operstate === 'unknown';

            return (
              <div key={idx} className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center space-x-2">
                    <Wifi className={`w-4 h-4 ${isUp ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <span className="font-mono font-bold text-slate-200 text-sm">{iface.iface}</span>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                    isUp ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {iface.operstate?.toUpperCase() || 'UP'}
                  </span>
                </div>

                <div className="space-y-1.5 font-mono text-xs pt-2 border-t border-slate-800/80">
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="flex items-center text-cyan-400">
                      <ArrowDown className="w-3 h-3 mr-1" />
                      Rx Speed:
                    </span>
                    <span className="text-slate-200 font-bold">{ifaceRx}</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-400">
                    <span className="flex items-center text-pink-400">
                      <ArrowUp className="w-3 h-3 mr-1" />
                      Tx Speed:
                    </span>
                    <span className="text-slate-200 font-bold">{ifaceTx}</span>
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                    <span>Total Rx: {formatBytes(iface.rx_bytes)}</span>
                    <span>Total Tx: {formatBytes(iface.tx_bytes)}</span>
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
