import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Network, 
  Terminal, 
  Radio, 
  Flame, 
  LineChart, 
  Layers, 
  ShieldAlert,
  Server,
  Zap,
  Box
} from 'lucide-react';

import { 
  SystemOverview, 
  SystemMetrics, 
  HistoryPoint, 
  AlertItem, 
  AlertRules, 
  LogEntry,
  ThemeMode,
  DockerContainer,
  DockerEngineInfo,
  VirtualizationInfo
} from './types/telemetry';

import { wsClient } from './services/websocket';
import { sound } from './services/sound';
import { Header } from './components/Header';
import { HeroCards } from './components/HeroCards';
import { CpuMatrix } from './components/CpuMatrix';
import { MemoryStorageView } from './components/MemoryStorageView';
import { NetworkView } from './components/NetworkView';
import { TimeSeriesCharts } from './components/TimeSeriesCharts';
import { ProcessManager } from './components/ProcessManager';
import { SystemLogsTerminal } from './components/SystemLogsTerminal';
import { BenchmarkSuite } from './components/BenchmarkSuite';
import { PortScanner } from './components/PortScanner';
import { AlertsBanner } from './components/AlertsBanner';
import { ContainerView } from './components/ContainerView';
import { VirtualizationView } from './components/VirtualizationView';

type TabKey = 'overview' | 'charts' | 'processes' | 'containers' | 'logs' | 'benchmark' | 'ports';

export const App: React.FC = () => {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [docker, setDocker] = useState<DockerEngineInfo | null>(null);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [virtualization, setVirtualization] = useState<VirtualizationInfo | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [rules, setRules] = useState<AlertRules>({
    cpuWarning: 75,
    cpuCritical: 90,
    ramWarning: 80,
    ramCritical: 92,
    diskWarning: 85,
    diskCritical: 95,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [uptimeSec, setUptimeSec] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [theme, setTheme] = useState<ThemeMode>('cyber');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [pollInterval, setPollInterval] = useState<number>(1000);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Sync sound engine state
  useEffect(() => {
    sound.enabled = soundEnabled;
  }, [soundEnabled]);

  // Initialize WebSocket connection & listeners
  useEffect(() => {
    wsClient.connect();

    const unsubscribe = wsClient.subscribe((type, data) => {
      switch (type) {
        case 'status':
          setIsConnected(data.connected);
          break;
        case 'init':
          if (data.overview) setOverview(data.overview);
          if (data.metrics || data.data) setMetrics(data.metrics || data.data);
          if (data.history) setHistory(data.history);
          if (data.alerts) setAlerts(data.alerts);
          if (data.rules) setRules(data.rules);
          if (data.logs) setLogs(data.logs);
          if (data.containers) {
            setDocker(data.containers.docker || null);
            setContainers(data.containers.containers || []);
          }
          if (data.virtualization) setVirtualization(data.virtualization);
          if ((data.metrics || data.data)?.uptime) setUptimeSec((data.metrics || data.data).uptime);
          break;
        case 'containers':
          if (data.data) {
            setDocker(data.data.docker || null);
            setContainers(data.data.containers || []);
          }
          break;
        case 'virtualization':
          if (data.data) setVirtualization(data.data);
          break;
        case 'tick': {
          const m = data.metrics || data.data;
          if (m) {
            setMetrics(m);
            if (m.uptime) setUptimeSec(m.uptime);
            if (data.historyPoint) {
              setHistory((prev) => [...prev.slice(-59), data.historyPoint]);
            } else {
              const hp: HistoryPoint = {
                timestamp: m.timestamp || Date.now(),
                timeLabel: new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                cpu: m.cpu?.usage ?? 0,
                ram: m.memory?.usedPercent ?? 0,
                swap: m.memory?.swapPercent ?? 0,
                load1: m.loadavg?.[0] ?? 0,
                netRx: Math.round(((m.network?.io?.rx_sec || 0) / 1024) * 10) / 10,
                netTx: Math.round(((m.network?.io?.tx_sec || 0) / 1024) * 10) / 10,
                diskRead: Math.round((((m.storage?.io?.rIO_sec || 0)) / 1024) * 10) / 10,
                diskWrite: Math.round((((m.storage?.io?.wIO_sec || 0)) / 1024) * 10) / 10,
              };
              setHistory((prev) => [...prev.slice(-59), hp]);
            }
          }
          if (data.alerts) {
            if (data.alerts.length > 0 && soundEnabled) {
              const hasCrit = data.alerts.some((a: any) => a.severity === 'CRITICAL');
              if (hasCrit) sound.playAlertCritical();
              else sound.playAlertWarning();
            }
            setAlerts(data.alerts);
          }
          break;
        }
        case 'log':
          setLogs((prev) => [data, ...prev.slice(0, 199)]);
          break;
        case 'interval_changed':
          setPollInterval(data.intervalMs);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [soundEnabled]);

  const fetchContainers = async () => {
    try {
      const res = await fetch('/api/containers');
      const resJson = await res.json();
      const data = resJson.data || resJson;
      if (data) {
        setDocker(data.docker || null);
        setContainers(data.containers || []);
      }
    } catch (e) {
      console.error('Failed to fetch containers:', e);
    }
  };

  const fetchVirtualization = async () => {
    try {
      const res = await fetch('/api/virtualization');
      const resJson = await res.json();
      const data = resJson.data || resJson;
      if (data) {
        setVirtualization(data);
      }
    } catch (e) {
      console.error('Failed to fetch virtualization:', e);
    }
  };

  useEffect(() => {
    fetchContainers();
    fetchVirtualization();
    const interval = setInterval(() => {
      if (activeTab === 'containers') {
        fetchContainers();
        fetchVirtualization();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Local uptime increment timer
  useEffect(() => {
    const timer = setInterval(() => {
      setUptimeSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const totalInstancesCount = (containers?.length || 0) + (virtualization?.vms?.length || 0);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'overview', label: 'Overview HUD', icon: <Layers className="w-4 h-4" /> },
    { key: 'charts', label: 'Oscilloscope', icon: <LineChart className="w-4 h-4" /> },
    { key: 'processes', label: 'Processes', icon: <Terminal className="w-4 h-4" /> },
    { key: 'containers', label: 'Containers & VMs', icon: <Box className="w-4 h-4" />, badge: totalInstancesCount > 0 ? totalInstancesCount : undefined },
    { key: 'logs', label: 'System Logs', icon: <Activity className="w-4 h-4" />, badge: logs.length },
    { key: 'benchmark', label: 'Stress Benchmark', icon: <Flame className="w-4 h-4" /> },
    { key: 'ports', label: 'Ports & Sockets', icon: <Radio className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-slate-100 flex flex-col font-sans transition-colors duration-300">
      
      {/* Top Header */}
      <Header
        overview={overview}
        uptimeSec={uptimeSec}
        isConnected={isConnected}
        theme={theme}
        onThemeChange={(newTheme) => setTheme(newTheme)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        pollInterval={pollInterval}
        onPollIntervalChange={(val) => {
          setPollInterval(val);
          wsClient.setInterval(val);
        }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 flex flex-col">
        
        {/* Active Alerts Banner */}
        <AlertsBanner
          alerts={alerts}
          rules={rules}
          onUpdateRules={(newRules) => setRules(newRules)}
        />

        {/* Hero Cards (Always visible on top) */}
        <HeroCards metrics={metrics} history={history} />

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  sound.playTabSwitch();
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_15px_rgba(0,240,255,0.25)]'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-transparent'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Panels */}
        <div className="flex-1 space-y-6">
          
          {/* TAB 1: OVERVIEW HUD */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {metrics && (
                <>
                  <CpuMatrix
                    cpu={metrics.cpu}
                    brand={overview?.cpu.brand}
                    coresCount={overview?.cpu.cores}
                    loadavg={metrics.loadavg}
                  />

                  <MemoryStorageView
                    memory={metrics.memory}
                    disks={metrics.storage.disks}
                    diskIO={metrics.storage.io}
                  />

                  <NetworkView
                    networkIO={metrics.network.io}
                    interfaces={metrics.network.interfaces}
                  />
                </>
              )}
            </div>
          )}

          {/* TAB 2: TIME SERIES CHARTS */}
          {activeTab === 'charts' && (
            <TimeSeriesCharts history={history} />
          )}

          {/* TAB 3: PROCESS MANAGER */}
          {activeTab === 'processes' && (
            <ProcessManager />
          )}

          {/* TAB 4: CONTAINERS & VMS */}
          {activeTab === 'containers' && (
            <div className="space-y-6">
              <ContainerView
                docker={docker}
                containers={containers}
                onRefresh={fetchContainers}
              />
              <VirtualizationView
                virt={virtualization}
                onRefresh={fetchVirtualization}
              />
            </div>
          )}

          {/* TAB 5: SYSTEM LOGS TERMINAL */}
          {activeTab === 'logs' && (
            <SystemLogsTerminal logs={logs} />
          )}

          {/* TAB 6: BENCHMARK SUITE */}
          {activeTab === 'benchmark' && (
            <BenchmarkSuite benchmarkActive={metrics?.benchmarkActive || false} />
          )}

          {/* TAB 7: PORTS & SERVICES */}
          {activeTab === 'ports' && (
            <PortScanner />
          )}

        </div>

      </main>

      {/* Footer */}
      <footer className="bg-[#080c14] border-t border-slate-900 py-3 px-6 text-center text-xs font-mono text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          <span>NexusPulse Telemetry OS v1.0.0</span>
          <span>•</span>
          <span>Node {overview?.nodeVersion || 'v22'}</span>
        </div>
        <div>
          Autonomous Real-Time Observability Stack
        </div>
      </footer>

    </div>
  );
};
