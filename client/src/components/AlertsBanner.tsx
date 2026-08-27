import React, { useState } from 'react';
import { AlertTriangle, Bell, Settings, X, Check, Volume2 } from 'lucide-react';
import { AlertItem, AlertRules } from '../types/telemetry';
import { sound } from '../services/sound';

interface AlertsBannerProps {
  alerts: AlertItem[];
  rules: AlertRules;
  onUpdateRules: (newRules: AlertRules) => void;
}

export const AlertsBanner: React.FC<AlertsBannerProps> = ({ alerts, rules, onUpdateRules }) => {
  const [configOpen, setConfigOpen] = useState(false);
  const [tempRules, setTempRules] = useState<AlertRules>(rules);

  const handleSave = async () => {
    try {
      const res = await fetch('/api/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tempRules)
      });
      if (res.ok) {
        onUpdateRules(tempRules);
        setConfigOpen(false);
        sound.playClick();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      {/* Active Alerts List */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3.5 rounded-lg border flex items-center justify-between font-mono text-xs shadow-lg animate-bounce-short ${
                alert.severity === 'CRITICAL'
                  ? 'bg-rose-950/80 border-rose-500/80 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.4)]'
                  : 'bg-amber-950/80 border-amber-500/80 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
              }`}
            >
              <div className="flex items-center space-x-3">
                <AlertTriangle className={`w-5 h-5 shrink-0 ${alert.severity === 'CRITICAL' ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
                <div>
                  <span className="font-bold uppercase tracking-wider mr-2">[{alert.severity}]</span>
                  <span>{alert.message}</span>
                  <span className="text-[11px] text-slate-400 ml-2">(Val: {alert.value} / Thr: {alert.threshold})</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Threshold Config Modal */}
      {configOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="cyber-card p-6 max-w-lg w-full border-cyan-500/40 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-cyan-400">
                <Settings className="w-5 h-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">THRESHOLD ALERT CONFIG</h3>
              </div>
              <button onClick={() => setConfigOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              {/* CPU Warning / Critical */}
              <div>
                <label className="text-slate-300 block mb-1">CPU Alert Thresholds (%)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-amber-400">Warning: {tempRules.cpuWarning}%</span>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={tempRules.cpuWarning}
                      onChange={(e) => setTempRules({ ...tempRules, cpuWarning: Number(e.target.value) })}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-400">Critical: {tempRules.cpuCritical}%</span>
                    <input
                      type="range"
                      min="70"
                      max="99"
                      value={tempRules.cpuCritical}
                      onChange={(e) => setTempRules({ ...tempRules, cpuCritical: Number(e.target.value) })}
                      className="w-full accent-rose-400"
                    />
                  </div>
                </div>
              </div>

              {/* RAM Warning / Critical */}
              <div>
                <label className="text-slate-300 block mb-1">Memory Alert Thresholds (%)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-amber-400">Warning: {tempRules.ramWarning}%</span>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={tempRules.ramWarning}
                      onChange={(e) => setTempRules({ ...tempRules, ramWarning: Number(e.target.value) })}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-400">Critical: {tempRules.ramCritical}%</span>
                    <input
                      type="range"
                      min="70"
                      max="99"
                      value={tempRules.ramCritical}
                      onChange={(e) => setTempRules({ ...tempRules, ramCritical: Number(e.target.value) })}
                      className="w-full accent-rose-400"
                    />
                  </div>
                </div>
              </div>

              {/* Disk Warning / Critical */}
              <div>
                <label className="text-slate-300 block mb-1">Disk Alert Thresholds (%)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-amber-400">Warning: {tempRules.diskWarning}%</span>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={tempRules.diskWarning}
                      onChange={(e) => setTempRules({ ...tempRules, diskWarning: Number(e.target.value) })}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-400">Critical: {tempRules.diskCritical}%</span>
                    <input
                      type="range"
                      min="70"
                      max="99"
                      value={tempRules.diskCritical}
                      onChange={(e) => setTempRules({ ...tempRules, diskCritical: Number(e.target.value) })}
                      className="w-full accent-rose-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6 pt-3 border-t border-slate-800 font-mono text-xs">
              <button
                onClick={() => setConfigOpen(false)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
              >
                Save Thresholds
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Threshold Gear Trigger Button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => {
            setTempRules(rules);
            setConfigOpen(true);
            sound.playClick();
          }}
          className="flex items-center space-x-1 px-3 py-1 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 hover:text-cyan-400 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Configure Alerts</span>
        </button>
      </div>
    </div>
  );
};
