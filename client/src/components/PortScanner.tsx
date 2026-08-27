import React, { useState, useEffect } from 'react';
import { Radio, RefreshCw, Shield, Globe, Lock } from 'lucide-react';
import { OpenPort } from '../types/telemetry';
import { sound } from '../services/sound';

export const PortScanner: React.FC = () => {
  const [ports, setPorts] = useState<OpenPort[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPorts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/ports');
      const data = await res.json();
      setPorts(data.ports || []);
    } catch (e) {
      console.error('Failed to fetch open ports:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPorts();
  }, []);

  return (
    <div className="cyber-card p-5">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">OPEN PORTS & SERVICES</h3>
            <span className="text-xs text-slate-400 font-mono">Listening network sockets & service daemons</span>
          </div>
        </div>

        <button
          onClick={() => {
            fetchPorts();
            sound.playClick();
          }}
          className="flex items-center space-x-1 px-3 py-1 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500 text-xs font-mono text-slate-300 hover:text-cyan-400 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Scan Ports</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[360px] overflow-y-auto">
        {ports.length === 0 ? (
          <div className="col-span-full py-8 text-center text-slate-500 font-mono text-xs">
            {loading ? 'Scanning socket tables...' : 'No listening ports detected or permission restricted.'}
          </div>
        ) : (
          ports.map((p, idx) => (
            <div key={idx} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-colors font-mono text-xs">
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-bold text-cyan-300 text-sm">:{p.localPort}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 uppercase font-bold">
                  {p.protocol}
                </span>
              </div>
              <div className="text-slate-400 text-[11px] truncate">
                Address: <span className="text-slate-300">{p.localAddress || '0.0.0.0'}</span>
              </div>
              <div className="text-slate-400 text-[11px] truncate mt-0.5">
                Process: <span className="text-purple-300">{p.process || 'N/A'}</span> {p.pid ? `(PID: ${p.pid})` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
