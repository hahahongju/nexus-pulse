import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Play, 
  Square, 
  RotateCw, 
  Terminal, 
  Search, 
  RefreshCw, 
  Layers, 
  Cpu, 
  HardDrive, 
  Network, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  PauseCircle, 
  PlayCircle,
  X,
  FileText
} from 'lucide-react';
import { DockerContainer, DockerEngineInfo } from '../types/telemetry';
import { sound } from '../services/sound';

interface ContainerViewProps {
  docker: DockerEngineInfo | null;
  containers: DockerContainer[];
  onRefresh?: () => void;
}

export const ContainerView: React.FC<ContainerViewProps> = ({ docker, containers, onRefresh }) => {
  const [filterState, setFilterState] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedLogsContainer, setSelectedLogsContainer] = useState<DockerContainer | null>(null);
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string }>>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause') => {
    setActionLoadingId(`${id}-${action}`);
    try {
      sound.playClick();
      const res = await fetch(`/api/containers/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg(`Container ${id} ${action} successful.`);
        sound.playAlertWarning();
        if (onRefresh) onRefresh();
      } else {
        setStatusMsg(`Error: ${data.message || data.error}`);
      }
    } catch (e: any) {
      setStatusMsg(`Action failed: ${e.message}`);
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const handleFetchLogs = async (container: DockerContainer) => {
    setSelectedLogsContainer(container);
    setLoadingLogs(true);
    sound.playClick();
    try {
      const res = await fetch(`/api/containers/${container.id}/logs?tail=100`);
      const data = await res.json();
      if (res.ok && data.data) {
        setLogs(data.data.lines || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleDeployDemo = async () => {
    setActionLoadingId('deploy-demo');
    try {
      sound.playBenchmarkStart();
      const res = await fetch('/api/containers/demo/deploy', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg('Sample container deployed successfully!');
        if (onRefresh) onRefresh();
      } else {
        setStatusMsg(`Deploy error: ${data.message || data.error}`);
      }
    } catch (e: any) {
      setStatusMsg(`Deploy failed: ${e.message}`);
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const filteredContainers = containers.filter((c) => {
    const matchesState = 
      filterState === 'ALL' ||
      (filterState === 'RUNNING' && c.state === 'running') ||
      (filterState === 'STOPPED' && (c.state === 'exited' || c.state === 'dead' || c.state === 'created')) ||
      (filterState === 'PAUSED' && c.state === 'paused');

    const matchesSearch = 
      !search || 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      c.image.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase());

    return matchesState && matchesSearch;
  });

  const runningCount = containers.filter(c => c.state === 'running').length;
  const pausedCount = containers.filter(c => c.state === 'paused').length;
  const stoppedCount = containers.filter(c => c.state === 'exited' || c.state === 'dead' || c.state === 'created').length;

  return (
    <div className="space-y-6">
      
      {/* 1. TOP DOCKER & CONTAINER HUD HERO CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Engine Status */}
        <div className="cyber-card p-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">DOCKER ENGINE</span>
                <div className="text-xs text-slate-200 font-mono font-bold">
                  {docker?.installed ? `v${docker.serverVersion || '29.x'}` : 'Not Detected'}
                </div>
              </div>
            </div>
            <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
              docker?.active 
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' 
                : 'bg-rose-950/80 text-rose-400 border border-rose-800'
            }`}>
              {docker?.active ? 'DAEMON ACTIVE' : 'STOPPED'}
            </span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 flex justify-between">
            <span>Driver: <strong className="text-slate-200">{docker?.driver || 'overlay2'}</strong></span>
            <span>Cgroups: <strong className="text-cyan-300">{docker?.cgroupDriver || 'systemd'}</strong></span>
          </div>
        </div>

        {/* Card 2: Running Containers */}
        <div className="cyber-card p-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">RUNNING FLEET</span>
                <div className="text-xs text-slate-400 font-mono">Live Workloads</div>
              </div>
            </div>
            <span className="text-2xl font-mono font-extrabold text-emerald-400">{runningCount}</span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 flex justify-between">
            <span>Total Containers: <strong className="text-slate-200">{containers.length || docker?.containersTotal || 0}</strong></span>
            <span>Images: <strong className="text-purple-300">{docker?.imagesCount || 0}</strong></span>
          </div>
        </div>

        {/* Card 3: Paused & Stopped */}
        <div className="cyber-card p-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <PauseCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">INACTIVE / PAUSED</span>
                <div className="text-xs text-slate-400 font-mono">Standby Containers</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-mono font-bold text-amber-400 mr-2">{pausedCount} P</span>
              <span className="text-xl font-mono font-bold text-slate-400">{stoppedCount} S</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 flex justify-between">
            <span>Storage Root:</span>
            <span className="text-slate-300 truncate max-w-[130px]">{docker?.dockerRootDir || '/var/lib/docker'}</span>
          </div>
        </div>

        {/* Card 4: Quick Actions / Deploy */}
        <div className="cyber-card p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">CONTAINER ACTIONS</div>
            <button
              onClick={() => {
                if (onRefresh) onRefresh();
                sound.playClick();
              }}
              className="p-1 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-400 transition-colors"
              title="Refresh Container States"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <button
            onClick={handleDeployDemo}
            disabled={actionLoadingId === 'deploy-demo'}
            className="w-full mt-2 py-2 px-3 rounded-md bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-white font-mono text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.25)] flex items-center justify-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{actionLoadingId === 'deploy-demo' ? 'DEPLOYING...' : 'DEPLOY DEMO CONTAINER'}</span>
          </button>
        </div>

      </div>

      {statusMsg && (
        <div className="p-2.5 rounded-lg bg-slate-900 border border-cyan-500/40 text-xs font-mono text-cyan-300 text-center animate-fade-in">
          {statusMsg}
        </div>
      )}

      {/* 2. CONTAINER FLEET TABLE */}
      <div className="cyber-card p-5">
        
        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">CONTAINER FLEET MATRIX</h3>
              <span className="text-xs text-slate-400 font-mono">
                Showing <strong className="text-cyan-300">{filteredContainers.length}</strong> of {containers.length} containers
              </span>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
            {/* State Tabs */}
            <div className="flex items-center rounded-md bg-slate-900 border border-slate-700 p-0.5">
              {(['ALL', 'RUNNING', 'PAUSED', 'STOPPED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    setFilterState(st);
                    sound.playClick();
                  }}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    filterState === st ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search container / image / ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-md pl-8 pr-3 py-1 text-slate-200 text-xs focus:border-cyan-400 outline-none w-48 sm:w-60"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Containers Table */}
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-slate-950/90 backdrop-blur border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2.5 px-3">CONTAINER</th>
                <th className="py-2.5 px-3">IMAGE</th>
                <th className="py-2.5 px-3">STATUS</th>
                <th className="py-2.5 px-3">CPU %</th>
                <th className="py-2.5 px-3">MEMORY USAGE</th>
                <th className="py-2.5 px-3">PORTS</th>
                <th className="py-2.5 px-3 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredContainers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono text-xs">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Box className="w-8 h-8 text-slate-600" />
                      <span>No containers matching the current filter.</span>
                      {containers.length === 0 && (
                        <button
                          onClick={handleDeployDemo}
                          className="mt-2 px-3 py-1.5 rounded bg-cyan-600/30 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-600/50 transition-colors"
                        >
                          + Deploy Sample Nginx Container
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredContainers.map((c) => {
                  const isRunning = c.state === 'running';
                  const isPaused = c.state === 'paused';

                  return (
                    <tr key={c.id} className="hover:bg-cyan-500/5 transition-colors group">
                      {/* Name & ID */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            isRunning ? 'bg-emerald-400 animate-pulse' : isPaused ? 'bg-amber-400' : 'bg-slate-600'
                          }`} />
                          <span className="text-cyan-300">{c.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">{c.id}</div>
                      </td>

                      {/* Image */}
                      <td className="py-3 px-3">
                        <div className="text-slate-300 truncate max-w-[160px]" title={c.image}>
                          {c.image}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded ${
                          isRunning ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' :
                          isPaused ? 'bg-amber-950/80 text-amber-400 border border-amber-800' :
                          'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}>
                          {c.status || c.state}
                        </span>
                      </td>

                      {/* CPU */}
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-between text-slate-300 mb-1">
                          <span>{c.cpuPercent.toFixed(1)}%</span>
                        </div>
                        <div className="w-24 bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-cyan-400 transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(2, c.cpuPercent))}%` }}
                          />
                        </div>
                      </td>

                      {/* Memory */}
                      <td className="py-3 px-3">
                        <div className="text-slate-300 text-[11px] mb-1">
                          {formatBytes(c.memUsage)} ({c.memPercent.toFixed(1)}%)
                        </div>
                        <div className="w-28 bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-purple-500 transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(2, c.memPercent))}%` }}
                          />
                        </div>
                      </td>

                      {/* Ports */}
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {c.ports && c.ports.length > 0 ? (
                          <div className="space-y-0.5">
                            {c.ports.map((p, idx) => (
                              <span key={idx} className="block text-cyan-400">
                                {p.publicPort ? `${p.publicPort}->${p.privatePort}/${p.type || 'tcp'}` : `${p.privatePort}/${p.type || 'tcp'}`}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {/* Logs Button */}
                          <button
                            onClick={() => handleFetchLogs(c)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                            title="View Container Logs"
                          >
                            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                          </button>

                          {/* Start / Stop */}
                          {isRunning ? (
                            <button
                              onClick={() => handleAction(c.id, 'stop')}
                              disabled={actionLoadingId === `${c.id}-stop`}
                              className="p-1 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-400 transition-colors"
                              title="Stop Container"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAction(c.id, 'start')}
                              disabled={actionLoadingId === `${c.id}-start`}
                              className="p-1 rounded bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800 text-emerald-400 transition-colors"
                              title="Start Container"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Pause / Unpause */}
                          {isRunning ? (
                            <button
                              onClick={() => handleAction(c.id, 'pause')}
                              disabled={actionLoadingId === `${c.id}-pause`}
                              className="p-1 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-800 text-amber-300 transition-colors"
                              title="Pause Container"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                            </button>
                          ) : isPaused ? (
                            <button
                              onClick={() => handleAction(c.id, 'unpause')}
                              disabled={actionLoadingId === `${c.id}-unpause`}
                              className="p-1 rounded bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 transition-colors"
                              title="Unpause Container"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                            </button>
                          ) : null}

                          {/* Restart */}
                          <button
                            onClick={() => handleAction(c.id, 'restart')}
                            disabled={actionLoadingId === `${c.id}-restart`}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                            title="Restart Container"
                          >
                            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* 3. CONTAINER LOGS TERMINAL MODAL */}
      {selectedLogsContainer && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="cyber-card p-5 max-w-3xl w-full h-[540px] flex flex-col border-cyan-500/40 shadow-2xl">
            
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs">
                <Terminal className="w-4 h-4" />
                <span className="font-bold text-slate-200">LOGS: {selectedLogsContainer.name}</span>
                <span className="text-slate-500">({selectedLogsContainer.id})</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleFetchLogs(selectedLogsContainer)}
                  className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-cyan-400 text-xs font-mono flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button onClick={() => setSelectedLogsContainer(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Console Log Feed */}
            <div className="flex-1 bg-black/80 rounded border border-slate-800 p-3 overflow-y-auto font-mono text-xs space-y-1">
              {loadingLogs ? (
                <div className="text-center py-12 text-slate-500">Streaming container output...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">No logs emitted by container yet.</div>
              ) : (
                logs.map((l, idx) => (
                  <div key={idx} className="flex items-start space-x-2 hover:bg-slate-900/60 p-0.5 rounded">
                    <span className="text-slate-500 text-[10px] shrink-0">
                      {new Date(l.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-slate-200 break-all">{l.message}</span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-800/80 flex justify-end">
              <button
                onClick={() => setSelectedLogsContainer(null)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
