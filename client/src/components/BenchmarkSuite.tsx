import React, { useState, useEffect } from 'react';
import { Flame, Play, Square, AlertTriangle, ShieldCheck, Zap, Activity } from 'lucide-react';
import { sound } from '../services/sound';
import { Tooltip } from './Tooltip';

interface BenchmarkSuiteProps {
  benchmarkActive: boolean;
}

export const BenchmarkSuite: React.FC<BenchmarkSuiteProps> = ({ benchmarkActive }) => {
  const [duration, setDuration] = useState<number>(10);
  const [cores, setCores] = useState<number>(4);
  const [ramMb, setRamMb] = useState<number>(512);
  const [remaining, setRemaining] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    let timer: any = null;
    if (benchmarkActive && remaining > 0) {
      timer = setInterval(() => {
        setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [benchmarkActive, remaining]);

  const handleStart = async () => {
    try {
      sound.playBenchmarkStart();
      const res = await fetch('/api/benchmark/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSec: duration, cpuCores: cores, ramMb })
      });
      const data = await res.json();
      if (res.ok) {
        setRemaining(duration);
        setStatusMsg(`Stress test triggered for ${duration}s across ${cores} cores.`);
      }
    } catch (e: any) {
      setStatusMsg(`Error: ${e.message}`);
    }
  };

  const handleStop = async () => {
    try {
      sound.playClick();
      await fetch('/api/benchmark/stop', { method: 'POST' });
      setRemaining(0);
      setStatusMsg('Stress test aborted.');
    } catch (e: any) {
      setStatusMsg(`Error: ${e.message}`);
    }
  };

  return (
    <div className="cyber-card p-5">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">SERVER STRESS & BENCHMARK SUITE</h3>
            <span className="text-xs text-slate-400 font-mono">Safe synthetic load generator to test monitoring reactivity</span>
          </div>
        </div>

        {benchmarkActive && (
          <div className="flex items-center space-x-2 bg-rose-950/60 border border-rose-500/50 px-3 py-1 rounded-full text-rose-300 font-mono text-xs animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>BENCHMARK ACTIVE ({remaining}s REMAINING)</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 font-mono text-xs">
        {/* Duration */}
        <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <label className="text-slate-400 block mb-1">STRESS DURATION</label>
          <div className="flex items-center space-x-2">
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={duration}
              disabled={benchmarkActive}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <span className="text-cyan-300 font-bold text-sm min-w-[36px] text-right">{duration}s</span>
          </div>
        </div>

        {/* CPU Cores */}
        <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <label className="text-slate-400 block mb-1">TARGET CPU CORES</label>
          <div className="flex items-center space-x-2">
            <input
              type="range"
              min="1"
              max="12"
              step="1"
              value={cores}
              disabled={benchmarkActive}
              onChange={(e) => setCores(Number(e.target.value))}
              className="w-full accent-purple-400 cursor-pointer"
            />
            <span className="text-purple-300 font-bold text-sm min-w-[36px] text-right">{cores}C</span>
          </div>
        </div>

        {/* RAM Allocation */}
        <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <label className="text-slate-400 block mb-1">RAM ALLOCATION</label>
          <div className="flex items-center space-x-2">
            <input
              type="range"
              min="128"
              max="2048"
              step="128"
              value={ramMb}
              disabled={benchmarkActive}
              onChange={(e) => setRamMb(Number(e.target.value))}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <span className="text-emerald-300 font-bold text-sm min-w-[48px] text-right">{ramMb}MB</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 font-mono text-xs">
        <div className="flex items-center space-x-2 text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Automated timer timeout protects system stability.</span>
        </div>

        <div className="flex items-center space-x-3">
          {benchmarkActive ? (
            <Tooltip content="진행 중인 스트레스 부하 테스트를 즉시 중단합니다">
              <button
                onClick={handleStop}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-[0_0_15px_rgba(244,63,94,0.4)]"
              >
                <Square className="w-4 h-4" />
                <span>STOP BENCHMARK</span>
              </button>
            </Tooltip>
          ) : (
            <Tooltip content="설정한 코어 및 메모리 부하를 안전하게 인가합니다">
              <button
                onClick={handleStart}
                className="flex items-center space-x-1.5 px-5 py-2 rounded-md bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-bold transition-all shadow-[0_0_15px_rgba(168,85,247,0.4)]"
              >
                <Play className="w-4 h-4" />
                <span>RUN STRESS BENCHMARK</span>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="mt-3 p-2 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 text-center">
          {statusMsg}
        </div>
      )}
    </div>
  );
};
