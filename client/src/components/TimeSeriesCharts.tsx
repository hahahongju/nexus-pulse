import React, { useRef, useEffect, useState } from 'react';
import { LineChart, Activity, RefreshCw } from 'lucide-react';
import { HistoryPoint } from '../types/telemetry';

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
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "Fira Code", monospace';
      ctx.fillText('Collecting telemetry samples...', 20, height / 2);
      return;
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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
        const y = height - norm * (height - 20) - 10;
        return { x, y };
      });

      // Fill gradient
      if (!isSecondary) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, strokeColor.replace('rgb', 'rgba').replace(')', ', 0.35)'));
        grad.addColorStop(1, strokeColor.replace('rgb', 'rgba').replace(')', ', 0.0)'));

        ctx.beginPath();
        ctx.moveTo(coords[0].x, height);
        coords.forEach((c) => ctx.lineTo(c.x, c.y));
        ctx.lineTo(coords[coords.length - 1].x, height);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Line stroke
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      coords.forEach((c, i) => {
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();

      // Current latest value dot
      const last = coords[coords.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.strokeStyle = '#080c14';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    renderSeries(points, color);

    if (points2 && color2) {
      renderSeries(points2, color2, true);
    }

    // Top scale label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Fira Code", monospace';
    ctx.fillText(`${maxVal}${unit}`, 6, 14);
    ctx.fillText(`0${unit}`, 6, height - 4);
  };

  useEffect(() => {
    // Draw CPU
    const cpuPoints = history.map((h) => ({ label: h.timeLabel, value: h.cpu }));
    const loadPoints = history.map((h) => ({ label: h.timeLabel, value: h.load1 * 10 }));
    drawCanvasChart(cpuCanvasRef.current, cpuPoints, 'rgb(0, 240, 255)', 'rgb(245, 158, 11)', loadPoints, '%', 100);

    // Draw RAM
    const ramPoints = history.map((h) => ({ label: h.timeLabel, value: h.ram }));
    const swapPoints = history.map((h) => ({ label: h.timeLabel, value: h.swap }));
    drawCanvasChart(memCanvasRef.current, ramPoints, 'rgb(168, 85, 247)', 'rgb(16, 185, 129)', swapPoints, '%', 100);

    // Draw Network
    const netRx = history.map((h) => ({ label: h.timeLabel, value: h.netRx }));
    const netTx = history.map((h) => ({ label: h.timeLabel, value: h.netTx }));
    drawCanvasChart(netCanvasRef.current, netRx, 'rgb(0, 240, 255)', 'rgb(236, 72, 153)', netTx, 'KB/s');

    // Draw Disk
    const diskR = history.map((h) => ({ label: h.timeLabel, value: h.diskRead }));
    const diskW = history.map((h) => ({ label: h.timeLabel, value: h.diskWrite }));
    drawCanvasChart(diskCanvasRef.current, diskR, 'rgb(16, 185, 129)', 'rgb(245, 158, 11)', diskW, 'KB/s');
  }, [history, selectedChart]);

  const latest = history[history.length - 1] || { cpu: 0, ram: 0, swap: 0, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 };

  return (
    <div className="space-y-4">
      {/* Chart Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 cyber-card p-3">
        <div className="flex items-center space-x-2">
          <LineChart className="w-5 h-5 text-cyan-400" />
          <span className="text-sm font-bold uppercase tracking-wider text-slate-200">REAL-TIME OSCILLOSCOPE (60s WINDOW)</span>
        </div>

        <div className="flex items-center space-x-1.5 font-mono text-xs">
          {(['all', 'cpu', 'ram', 'net', 'disk'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedChart(tab)}
              className={`px-3 py-1 rounded-md transition-colors uppercase ${
                selectedChart === tab
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
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
          <div className="cyber-card p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,240,255,0.6)]" />
                <span className="font-mono font-bold text-xs text-slate-200">CPU UTILIZATION (%)</span>
                <span className="text-[11px] font-mono text-amber-400 ml-2">--- 1m Load Avg</span>
              </div>
              <span className="font-mono font-bold text-cyan-400 text-sm">{latest.cpu.toFixed(1)}%</span>
            </div>
            <div className="h-44 w-full relative">
              <canvas ref={cpuCanvasRef} className="w-full h-full block" />
            </div>
          </div>
        )}

        {/* MEMORY CHART */}
        {(selectedChart === 'all' || selectedChart === 'ram') && (
          <div className="cyber-card p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                <span className="font-mono font-bold text-xs text-slate-200">MEMORY ALLOCATION (%)</span>
                <span className="text-[11px] font-mono text-emerald-400 ml-2">--- Swap %</span>
              </div>
              <span className="font-mono font-bold text-purple-400 text-sm">{latest.ram.toFixed(1)}%</span>
            </div>
            <div className="h-44 w-full relative">
              <canvas ref={memCanvasRef} className="w-full h-full block" />
            </div>
          </div>
        )}

        {/* NETWORK CHART */}
        {(selectedChart === 'all' || selectedChart === 'net') && (
          <div className="cyber-card p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-cyan-400" />
                <span className="font-mono font-bold text-xs text-slate-200">NETWORK RX (↓ CYAN) / TX (↑ PINK)</span>
              </div>
              <div className="font-mono text-xs space-x-2">
                <span className="text-cyan-400 font-bold">{latest.netRx} KB/s</span>
                <span className="text-pink-400 font-bold">{latest.netTx} KB/s</span>
              </div>
            </div>
            <div className="h-44 w-full relative">
              <canvas ref={netCanvasRef} className="w-full h-full block" />
            </div>
          </div>
        )}

        {/* DISK IO CHART */}
        {(selectedChart === 'all' || selectedChart === 'disk') && (
          <div className="cyber-card p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="font-mono font-bold text-xs text-slate-200">DISK READ (EMERALD) / WRITE (AMBER)</span>
              </div>
              <div className="font-mono text-xs space-x-2">
                <span className="text-emerald-400 font-bold">{latest.diskRead} KB/s</span>
                <span className="text-amber-400 font-bold">{latest.diskWrite} KB/s</span>
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
