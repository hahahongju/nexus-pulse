import React, { useState, useEffect } from 'react';
import { Terminal, Search, Trash2, AlertTriangle, RefreshCw, X, ShieldAlert } from 'lucide-react';
import { ProcessItem, ProcessResponse } from '../types/telemetry';
import { wsClient } from '../services/websocket';
import { sound } from '../services/sound';

export const ProcessManager: React.FC = () => {
  const [processes, setProcesses] = useState<ProcessResponse>({ all: 0, running: 0, list: [] });
  const [sort, setSort] = useState<'cpu' | 'mem'>('cpu');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProc, setSelectedProc] = useState<ProcessItem | null>(null);
  const [killSignal, setKillSignal] = useState<'SIGTERM' | 'SIGKILL'>('SIGTERM');
  const [killStatus, setKillStatus] = useState<string | null>(null);

  const fetchProcesses = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/system/processes?sort=${sort}&limit=50&search=${encodeURIComponent(search)}`);
      const resJson = await res.json();
      const data = resJson.data || resJson;
      setProcesses({
        all: data.all ?? data.total ?? (data.list ? data.list.length : 0),
        running: data.running ?? 0,
        list: data.list || []
      });
    } catch (e) {
      console.error('Failed to fetch processes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 3000);
    return () => clearInterval(interval);
  }, [sort, search]);

  const handleKill = async () => {
    if (!selectedProc) return;
    try {
      const res = await fetch('/api/system/processes/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: selectedProc.pid, signal: killSignal })
      });
      const data = await res.json();
      if (res.ok) {
        setKillStatus(`Process PID ${selectedProc.pid} terminated.`);
        sound.playAlertWarning();
        setTimeout(() => {
          setSelectedProc(null);
          setKillStatus(null);
          fetchProcesses();
        }, 1200);
      } else {
        setKillStatus(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setKillStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div className="cyber-card p-5">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">ACTIVE PROCESS EXPLORER</h3>
            <span className="text-xs text-slate-400 font-mono">
              Total: <strong className="text-cyan-300">{processes.all}</strong> | Running: <strong className="text-emerald-400">{processes.running}</strong>
            </span>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search PID / Name / User..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-md pl-8 pr-3 py-1 text-slate-200 text-xs focus:border-cyan-400 outline-none w-48 sm:w-60"
            />
            {search && (
              <button 
                onClick={() => setSearch('')} 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Buttons */}
          <div className="flex items-center rounded-md bg-slate-900 border border-slate-700 p-0.5">
            <button
              onClick={() => {
                setSort('cpu');
                sound.playClick();
              }}
              className={`px-2.5 py-1 rounded text-xs ${
                sort === 'cpu' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Top CPU
            </button>
            <button
              onClick={() => {
                setSort('mem');
                sound.playClick();
              }}
              className={`px-2.5 py-1 rounded text-xs ${
                sort === 'mem' ? 'bg-purple-500/20 text-purple-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Top RAM
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => {
              fetchProcesses();
              sound.playClick();
            }}
            className="p-1.5 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
            title="Refresh Process List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Process Table */}
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead className="sticky top-0 bg-slate-950/90 backdrop-blur border-b border-slate-800 text-slate-400">
            <tr>
              <th className="py-2 px-3">PID</th>
              <th className="py-2 px-3">PROCESS NAME</th>
              <th className="py-2 px-3 text-right">CPU %</th>
              <th className="py-2 px-3 text-right">RAM %</th>
              <th className="py-2 px-3">USER</th>
              <th className="py-2 px-3">STATE</th>
              <th className="py-2 px-3 text-center">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {processes.list.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  {loading ? 'Scanning processes...' : 'No matching processes found.'}
                </td>
              </tr>
            ) : (
              processes.list.map((p) => (
                <tr key={p.pid} className="hover:bg-cyan-500/5 transition-colors group">
                  <td className="py-2 px-3 text-cyan-400 font-bold">{p.pid}</td>
                  <td className="py-2 px-3 font-semibold text-slate-200">
                    <div className="truncate max-w-[220px]" title={p.command || p.name}>
                      {p.name}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-slate-200">
                    <span className={p.cpu > 50 ? 'text-rose-400' : p.cpu > 20 ? 'text-amber-400' : 'text-slate-300'}>
                      {p.cpu.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-purple-300">
                    {p.mem.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-slate-400">{p.user}</td>
                  <td className="py-2 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                      p.state === 'running' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' :
                      p.state === 'sleeping' ? 'bg-slate-900 text-slate-400 border border-slate-800' :
                      'bg-amber-950/80 text-amber-400 border border-amber-800'
                    }`}>
                      {p.state}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => {
                        setSelectedProc(p);
                        sound.playClick();
                      }}
                      className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 transition-colors opacity-70 group-hover:opacity-100"
                      title="Kill Process"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Kill Process Modal */}
      {selectedProc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="cyber-card p-6 max-w-md w-full border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.3)] animate-in fade-in">
            <div className="flex items-center space-x-3 mb-4 text-rose-400">
              <ShieldAlert className="w-6 h-6" />
              <h4 className="text-base font-bold uppercase tracking-wider text-white">TERMINATE PROCESS</h4>
            </div>

            <p className="text-xs text-slate-300 font-mono mb-4 leading-relaxed">
              Are you sure you want to terminate process <strong className="text-cyan-400">{selectedProc.name}</strong> (PID: <strong className="text-rose-400">{selectedProc.pid}</strong>)?
            </p>

            <div className="mb-4">
              <label className="text-xs text-slate-400 font-mono block mb-1">Termination Signal:</label>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <button
                  onClick={() => setKillSignal('SIGTERM')}
                  className={`p-2 rounded border text-left ${
                    killSignal === 'SIGTERM'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-bold">SIGTERM (15)</div>
                  <div className="text-[10px] text-slate-500">Graceful Request</div>
                </button>
                <button
                  onClick={() => setKillSignal('SIGKILL')}
                  className={`p-2 rounded border text-left ${
                    killSignal === 'SIGKILL'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-bold">SIGKILL (9)</div>
                  <div className="text-[10px] text-slate-500">Immediate Force Kill</div>
                </button>
              </div>
            </div>

            {killStatus && (
              <div className="mb-4 p-2 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-center text-cyan-300">
                {killStatus}
              </div>
            )}

            <div className="flex justify-end space-x-2 font-mono text-xs">
              <button
                onClick={() => setSelectedProc(null)}
                className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleKill}
                className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-[0_0_15px_rgba(244,63,94,0.4)]"
              >
                EXECUTE KILL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
