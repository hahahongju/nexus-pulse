import React, { useRef, useEffect, useState } from 'react';
import { LineChart } from 'lucide-react';
import { HistoryPoint } from '../types/telemetry';
import { formatKbSpeed } from '../utils/formatters';

interface TimeSeriesChartsProps {
  history: HistoryPoint[];
}

export const TimeSeriesCharts: React.FC<TimeSeriesChartsProps> = ({ history }) => {
  const [selectedChart, setSelectedChart] = useState<'all' | 'cpu' | 'ram' | 'net' | 'disk'>('all');
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const memCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const netCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const diskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawCanvasChart = (
    canvas: HTMLCanvasElement | null,
    points: { label: string; value: number }[],
    color: string,
    color2?: string,
    points2?: { label: string; value: number }[],
    unit: string = '%',
    fixedMax?: number
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    if (points.length < 2) {
      ctx.fillStyle = '#71717a';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText('Accumulating rolling telemetry window...', 16, height / 2);
      return;
    }

    // Grid lines - 1px razor whisper dividers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Determine bounds
    let maxVal = fixedMax || 100;
    if (!fixedMax) {
      const allVals = [...points.map((p) => p.value), ...(points2 ? points2.map((p) => p.value) : [])];
      maxVal = Math.max(...allVals, 10);
      maxVal = Math.ceil(maxVal * 1.15);
    }
    const minVal = 0;

    const renderSeries = (data: { value: number }[], strokeColor: string, isSecondary = false) => {
      const stepX = width / (data.length - 1);
      const coords = data.map((d, i) => {
        const x = i * stepX;
        const norm = Math.min(1, Math.max(0, (d.value - minVal) / (maxVal - minVal || 1)));
        const y = height - norm * (height - 24) - 12;
        return { x, y };
      });

      // Subtle gradient fill for primary series
      if (!isSecondary) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, strokeColor.replace('rgb', 'rgba').replace(')', ', 0.18)'));
        grad.addColorStop(1, strokeColor.replace('rgb', 'rgba').replace(')', ', 0.0)'));

        ctx.beginPath();
        ctx.moveTo(coords[0].x, height);
        coords.forEach((c) => ctx.lineTo(c.x, c.y));
        ctx.lineTo(coords[coords.length - 1].x, height);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Smooth Stroke
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.75;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      coords.forEach((c, i) => {
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();

      // Current latest value micro dot
      const last = coords[coords.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    renderSeries(points, color);

    if (points2 && color2) {
      renderSeries(points2, color2, true);
    }

    // Scale labels in monospace
    ctx.fillStyle = '#71717a';
    ctx.font = '10px "JetBrains Mono", monospace';
    const maxLabel = unit === 'KB/s' ? formatKbSpeed(maxVal) : `${maxVal}${unit}`;
    const minLabel = unit === 'KB/s' ? '0 B/s' : `0${unit}`;
    ctx.fillText(maxLabel, 8, 14);
    ctx.fillText(minLabel, 8, height - 6);
  };

  useEffect(() => {
    // Draw CPU
    const cpuPoints = history.map((h) => ({ label: h.timeLabel, value: h.cpu }));
    const loadPoints = history.map((h) => ({ label: h.timeLabel, value: h.load1 * 10 }));
    drawCanvasChart(cpuCanvasRef.current, cpuPoints, 'rgb(6, 182, 212)', 'rgb(245, 158, 11)', loadPoints, '%', 100);

    // Draw RAM
    const ramPoints = history.map((h) => ({ label: h.timeLabel, value: h.ram }));
    const swapPoints = history.map((h) => ({ label: h.timeLabel, value: h.swap }));
    drawCanvasChart(memCanvasRef.current, ramPoints, 'rgb(99, 102, 241)', 'rgb(16, 185, 129)', swapPoints, '%', 100);

    // Draw Network
    const netRx = history.map((h) => ({ label: h.timeLabel, value: h.netRx }));
    const netTx = history.map((h) => ({ label: h.timeLabel, value: h.netTx }));
    drawCanvasChart(netCanvasRef.current, netRx, 'rgb(6, 182, 212)', 'rgb(16, 185, 129)', netTx, 'KB/s');

    // Draw Disk
    const diskR = history.map((h) => ({ label: h.timeLabel, value: h.diskRead }));
    const diskW = history.map((h) => ({ label: h.timeLabel, value: h.diskWrite }));
    drawCanvasChart(diskCanvasRef.current, diskR, 'rgb(16, 185, 129)', 'rgb(245, 158, 11)', diskW, 'KB/s');
  }, [history, selectedChart]);

  const latest = history[history.length - 1] || { cpu: 0, ram: 0, swap: 0, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 };

  return (
    <div className="space-y-4">
      {/* Chart Filter Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 stitch-panel p-3">
        <div className="flex items-center space-x-2">
          <LineChart className="w-4 h-4 text-[var(--accent-primary)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)] font-mono">
            60-Second Rolling Oscilloscope
          </span>
        </div>

        <div className="flex items-center space-x-1 font-mono text-xs">
          {(['all', 'cpu', 'ram', 'net', 'disk'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedChart(tab)}
              className={`px-3 py-1 rounded-md transition-colors uppercase font-semibold ${
                selectedChart === tab
                  ? 'bg-[var(--accent-primary-muted)] text-[var(--accent-primary)] border border-[var(--border-focus)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Canvas Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* CPU CHART */}
        {(selectedChart === 'all' || selectedChart === 'cpu') && (
          <div className="stitch-panel p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span className="font-mono font-semibold text-xs text-[var(--text-main)]">CPU COMPUTE LOAD (%)</span>
                <span className="text-[10px] font-mono text-amber-400 ml-1.5">• 1m Load</span>
              </div>
              <span className="font-mono font-bold text-cyan-400 text-xs tabular-nums">{latest.cpu.toFixed(1)}%</span>
            </div>
            <div className="h-44 w-full relative">
              <canvas ref={cpuCanvasRef} className="w-full h-full block" />
            </div>
          </div>
        )}

        {/* MEMORY CHART */}
        {(selectedChart === 'all' || selectedChart === 'ram') && (
          <div className="stitch-panel p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                <span className="font-mono font-semibold text-xs text-[var(--text-main)]">RAM ALLOCATION (%)</span>
                <span className="text-[10px] font-mono text-emerald-400 ml-1.5">• Swap</span>
              </div>
              <span className="font-mono font-bold text-indigo-400 text-xs tabular-nums">{latest.ram.toFixed(1)}%</span>
            </div>
            <div className="h-44 w-full relative">
              <canvas ref={memCanvasRef} className="w-full h-full block" />
            </div>
          </div>
        )}

        {/* NETWORK CHART */}
        {(selectedChart === 'all' || selectedChart === 'net') && (
          <div className="stitch-panel p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span className="font-mono font-semibold text-xs text-[var(--text-main)]">NETWORK BANDWIDTH</span>
              </div>
              <div className="font-mono text-xs space-x-2 tabular-nums">
                <span className="text-cyan-400 font-medium">↓ {formatKbSpeed(latest.netRx)}</span>
                <span className="text-emerald-400 font-medium">↑ {formatKbSpeed(latest.netTx)}</span>
              </div>
            </div>
            <div className="h-44 w-full relative">
              <canvas ref={netCanvasRef} className="w-full h-full block" />
            </div>
          </div>
        )}

        {/* DISK IO CHART */}
        {(selectedChart === 'all' || selectedChart === 'disk') && (
          <div className="stitch-panel p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="font-mono font-semibold text-xs text-[var(--text-main)]">DISK I/O RATE</span>
              </div>
              <div className="font-mono text-xs space-x-2 tabular-nums">
                <span className="text-emerald-400 font-medium">R: {formatKbSpeed(latest.diskRead)}</span>
                <span className="text-amber-400 font-medium">W: {formatKbSpeed(latest.diskWrite)}</span>
              </div>
            </div>
            <div className="h-44 w-full relative">
              <canvas ref={diskCanvasRef} className="w-full h-full block" />
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
