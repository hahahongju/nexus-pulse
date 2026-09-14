import React, { useState } from 'react';
import { AlertTriangle, Settings, X } from 'lucide-react';
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
              className={`p-3 rounded-lg border flex items-center justify-between font-mono text-xs transition-all ${
                alert.severity === 'CRITICAL'
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                  : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              }`}
            >
              <div className="flex items-center space-x-3">
                <AlertTriangle className={`w-4 h-4 shrink-0 ${alert.severity === 'CRITICAL' ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
                <div>
                  <span className="font-bold uppercase tracking-wider mr-2">[{alert.severity}]</span>
                  <span className="text-[var(--text-main)] font-medium">{alert.message}</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-2">(Metric: {alert.value}% / Limit: {alert.threshold}%)</span>
                </div>
              </div>

              <div className="text-[10px] text-[var(--text-muted)] tabular-nums">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Threshold Config Modal */}
      {configOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="stitch-panel p-6 max-w-lg w-full shadow-2xl border-[var(--border-color)]">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-color)]">
              <div className="flex items-center space-x-2 text-[var(--accent-primary)]">
                <Settings className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)] font-mono">
                  Telemetry Threshold Configuration
                </h3>
              </div>
              <button onClick={() => setConfigOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              {/* CPU Warning / Critical */}
              <div>
                <label className="text-[var(--text-main)] block mb-1 text-xs font-semibold">CPU Load Thresholds (%)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <span className="text-[10px] text-amber-400 block mb-1">Warning: {tempRules.cpuWarning}%</span>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={tempRules.cpuWarning}
                      onChange={(e) => setTempRules({ ...tempRules, cpuWarning: Number(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <span className="text-[10px] text-rose-400 block mb-1">Critical: {tempRules.cpuCritical}%</span>
                    <input
                      type="range"
                      min="70"
                      max="99"
                      value={tempRules.cpuCritical}
                      onChange={(e) => setTempRules({ ...tempRules, cpuCritical: Number(e.target.value) })}
                      className="w-full accent-rose-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* RAM Warning / Critical */}
              <div>
                <label className="text-[var(--text-main)] block mb-1 text-xs font-semibold">Memory Load Thresholds (%)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <span className="text-[10px] text-amber-400 block mb-1">Warning: {tempRules.ramWarning}%</span>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={tempRules.ramWarning}
                      onChange={(e) => setTempRules({ ...tempRules, ramWarning: Number(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <span className="text-[10px] text-rose-400 block mb-1">Critical: {tempRules.ramCritical}%</span>
                    <input
                      type="range"
                      min="70"
                      max="99"
                      value={tempRules.ramCritical}
                      onChange={(e) => setTempRules({ ...tempRules, ramCritical: Number(e.target.value) })}
                      className="w-full accent-rose-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Disk Warning / Critical */}
              <div>
                <label className="text-[var(--text-main)] block mb-1 text-xs font-semibold">Storage Volume Thresholds (%)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <span className="text-[10px] text-amber-400 block mb-1">Warning: {tempRules.diskWarning}%</span>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={tempRules.diskWarning}
                      onChange={(e) => setTempRules({ ...tempRules, diskWarning: Number(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <span className="text-[10px] text-rose-400 block mb-1">Critical: {tempRules.diskCritical}%</span>
                    <input
                      type="range"
                      min="70"
                      max="99"
                      value={tempRules.diskCritical}
                      onChange={(e) => setTempRules({ ...tempRules, diskCritical: Number(e.target.value) })}
                      className="w-full accent-rose-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6 pt-3 border-t border-[var(--border-color)] font-mono text-xs">
              <button
                onClick={() => setConfigOpen(false)}
                className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] border border-[var(--border-color)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-1.5 rounded-lg bg-[var(--accent-primary-muted)] hover:bg-[var(--accent-primary)] hover:text-black text-[var(--accent-primary)] font-semibold border border-[var(--border-focus)] transition-all active:translate-y-[1px]"
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
          className="flex items-center space-x-1.5 px-3 py-1 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-xs font-mono text-[var(--text-sub)] hover:text-[var(--text-main)] transition-colors"
        >
          <Settings className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>알림 기준 설정</span>
        </button>
      </div>
    </div>
  );
};
