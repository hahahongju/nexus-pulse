import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Download, Trash2, Pause, Play, Search, Filter } from 'lucide-react';
import { LogEntry } from '../types/telemetry';
import { sound } from '../services/sound';
import { Tooltip } from './Tooltip';

interface SystemLogsTerminalProps {
  logs: LogEntry[];
}

export const SystemLogsTerminal: React.FC<SystemLogsTerminalProps> = ({ logs }) => {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    const matchesSearch = !search || log.message.toLowerCase().includes(search.toLowerCase()) || log.source.toLowerCase().includes(search.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
      case 'CRITICAL':
        return 'bg-rose-950/80 text-rose-400 border-rose-800';
      case 'WARN':
        return 'bg-amber-950/80 text-amber-400 border-amber-800';
      case 'SUCCESS':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800';
      case 'BENCHMARK':
        return 'bg-purple-950/80 text-purple-400 border-purple-800';
      default:
        return 'bg-cyan-950/80 text-cyan-400 border-cyan-800';
    }
  };

  const downloadLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level}] [${l.source}] ${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-pulse-logs-${Date.now()}.txt`;
    a.click();
    sound.playClick();
  };

  return (
    <div className="cyber-card p-5 flex flex-col h-[520px]">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">SYSTEM EVENT LOG TERMINAL</h3>
            <span className="text-xs text-slate-400 font-mono">{filteredLogs.length} events logged</span>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          {/* Level Filter */}
          <Tooltip content="로그 심각도 레벨 필터링">
            <select
              value={filterLevel}
              onChange={(e) => {
                setFilterLevel(e.target.value);
                sound.playClick();
              }}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 outline-none cursor-pointer"
            >
              <option value="ALL">ALL LEVELS</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
              <option value="BENCHMARK">BENCHMARK</option>
            </select>
          </Tooltip>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded pl-7 pr-2 py-1 text-slate-200 text-xs w-36 outline-none focus:border-cyan-400"
            />
          </div>

          {/* Auto Scroll Toggle */}
          <Tooltip content="실시간 자동 스크롤 켜기/끄기">
            <button
              onClick={() => {
                setAutoScroll(!autoScroll);
                sound.playClick();
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded border transition-colors ${
                autoScroll ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
            >
              {autoScroll ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>Scroll</span>
            </button>
          </Tooltip>

          {/* Export */}
          <Tooltip content="로그 파일 텍스트(.txt) 다운로드">
            <button
              onClick={downloadLogs}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>Export</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Terminal View Body */}
      <div className="flex-1 bg-black/70 rounded-lg border border-slate-800 p-3.5 overflow-y-auto font-mono text-xs space-y-1.5 shadow-inner">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 text-center py-12">No logs matching current filter.</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start space-x-2 leading-relaxed hover:bg-slate-900/60 p-0.5 rounded transition-colors">
              <span className="text-slate-500 text-[11px] shrink-0">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`px-1 py-0.2 rounded text-[10px] uppercase font-bold border shrink-0 ${getLevelBadge(log.level)}`}>
                {log.level}
              </span>
              <span className="text-slate-400 shrink-0 text-[11px]">[{log.source}]</span>
              <span className={`break-all ${
                log.level === 'ERROR' ? 'text-rose-300 font-semibold' :
                log.level === 'WARN' ? 'text-amber-300' :
                log.level === 'BENCHMARK' ? 'text-purple-300' :
                'text-slate-200'
              }`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
