import React, { useState, useEffect } from 'react';
import { Terminal, Search, Trash2, RefreshCw, X, ShieldAlert } from 'lucide-react';
import { ProcessItem, ProcessResponse } from '../types/telemetry';
import { sound } from '../services/sound';
import { Tooltip } from './Tooltip';

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
    <div className="stitch-panel p-5">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-[var(--border-color)]">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-md bg-[var(--accent-primary-muted)] border border-[var(--border-color)] text-[var(--accent-primary)]">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)] font-mono">
              Process Lifecycle Explorer
            </h3>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              Total: <strong className="text-[var(--text-main)] tabular-nums">{processes.all}</strong> • Running: <strong className="text-emerald-400 tabular-nums">{processes.running}</strong>
            </span>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search PID / Command / User..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg pl-8 pr-7 py-1.5 text-[var(--text-main)] text-xs focus:border-[var(--border-focus)] outline-none w-48 sm:w-60 font-mono transition-colors"
            />
            {search && (
              <button 
                onClick={() => setSearch('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-[var(--text-main)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Tabs */}
          <div className="flex items-center rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] p-0.5">
            <Tooltip content="CPU 사용량 순 정렬">
              <button
                onClick={() => {
                  setSort('cpu');
                  sound.playClick();
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-all ${
                  sort === 'cpu' ? 'bg-[var(--accent-primary-muted)] text-[var(--accent-primary)] border border-[var(--border-focus)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Top CPU
              </button>
            </Tooltip>
            <Tooltip content="메모리 점유율 순 정렬">
              <button
                onClick={() => {
                  setSort('mem');
                  sound.playClick();
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-all ${
                  sort === 'mem' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Top RAM
              </button>
            </Tooltip>
          </div>

          {/* Refresh Button */}
          <Tooltip content="프로세스 목록 즉시 새로고침">
            <button
              onClick={() => {
                fetchProcesses();
                sound.playClick();
              }}
              className="p-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--border-hover)] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--accent-primary)]' : ''}`} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Process Table */}
      <div className="overflow-x-auto max-h-[440px] overflow-y-auto rounded-lg border border-[var(--border-color)]">
        <table className="w-full text-left font-mono text-xs">
          <thead className="sticky top-0 bg-[var(--bg-primary)] border-b border-[var(--border-color)] text-[var(--text-muted)] text-[10px] tracking-wider uppercase">
            <tr>
              <th className="py-2.5 px-3">PID</th>
              <th className="py-2.5 px-3">PROCESS NAME</th>
              <th className="py-2.5 px-3 text-right">CPU %</th>
              <th className="py-2.5 px-3 text-right">RAM %</th>
              <th className="py-2.5 px-3">USER</th>
              <th className="py-2.5 px-3">STATE</th>
              <th className="py-2.5 px-3 text-center">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {processes.list.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                  {loading ? 'Scanning processes...' : 'No matching processes found.'}
                </td>
              </tr>
            ) : (
              processes.list.map((p) => (
                <tr key={p.pid} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="py-2 px-3 text-[var(--accent-primary)] font-semibold tabular-nums">{p.pid}</td>
                  <td className="py-2 px-3 font-medium text-[var(--text-main)]">
                    <div className="truncate max-w-[220px]" title={p.command || p.name}>
                      {p.name}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-semibold tabular-nums">
                    <span className={p.cpu > 50 ? 'text-rose-400' : p.cpu > 20 ? 'text-amber-400' : 'text-[var(--text-main)]'}>
                      {p.cpu.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-indigo-400 tabular-nums">
                    {p.mem.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-[var(--text-muted)]">{p.user}</td>
                  <td className="py-2 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                      p.state === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                      p.state === 'sleeping' ? 'bg-zinc-800 text-zinc-400 border border-zinc-700/50' :
                      'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {p.state}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <Tooltip content={`프로세스 종료 (PID: ${p.pid})`}>
                      <button
                        onClick={() => {
                          setSelectedProc(p);
                          sound.playClick();
                        }}
                        className="p-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors opacity-70 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Kill Process Modal */}
      {selectedProc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="stitch-panel p-6 max-w-md w-full border-rose-500/40 shadow-2xl animate-in fade-in">
            <div className="flex items-center space-x-2.5 mb-3 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)] font-mono">
                Terminate Process Signal
              </h4>
            </div>

            <p className="text-xs text-[var(--text-sub)] font-mono mb-4 leading-relaxed">
              Are you sure you want to terminate process <strong className="text-[var(--accent-primary)]">{selectedProc.name}</strong> (PID: <strong className="text-rose-400">{selectedProc.pid}</strong>)?
            </p>

            <div className="mb-4">
              <label className="text-[10px] text-[var(--text-muted)] font-mono block mb-1 uppercase tracking-wider">Termination Signal:</label>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <button
                  onClick={() => setKillSignal('SIGTERM')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    killSignal === 'SIGTERM'
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 font-semibold'
                      : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-muted)]'
                  }`}
                >
                  <div className="font-semibold">SIGTERM (15)</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Graceful Shutdown</div>
                </button>
                <button
                  onClick={() => setKillSignal('SIGKILL')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    killSignal === 'SIGKILL'
                      ? 'bg-rose-500/10 border-rose-500/50 text-rose-300 font-semibold'
                      : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-muted)]'
                  }`}
                >
                  <div className="font-semibold">SIGKILL (9)</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Immediate Force Kill</div>
                </button>
              </div>
            </div>

            {killStatus && (
              <div className="mb-4 p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs font-mono text-center text-cyan-400">
                {killStatus}
              </div>
            )}

            <div className="flex justify-end space-x-2 font-mono text-xs">
              <button
                onClick={() => setSelectedProc(null)}
                className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] border border-[var(--border-color)] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleKill}
                className="px-4 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-300 border border-rose-500/50 font-semibold transition-all active:translate-y-[1px]"
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
