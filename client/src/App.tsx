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
  Box,
  Download
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
import { DownloadCenter } from './components/DownloadCenter';
import { LoginGate } from './components/LoginGate';
import { authService } from './services/auth';

type TabKey = 'overview' | 'charts' | 'processes' | 'containers' | 'downloads' | 'logs' | 'benchmark' | 'ports';

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState<boolean>(true);

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
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [pollInterval, setPollInterval] = useState<number>(1000);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Sync sound engine state
  useEffect(() => {
    sound.enabled = soundEnabled;
  }, [soundEnabled]);

  // Verify existing token on initial mount
  useEffect(() => {
    let mounted = true;
    const verifyAuth = async () => {
      const token = authService.getToken();
      if (!token) {
        if (mounted) {
          setIsAuthenticated(false);
          setIsVerifyingAuth(false);
        }
        return;
      }

      try {
        const res = await authService.verifyToken(token);
        if (mounted) {
          if (res.valid) {
            setIsAuthenticated(true);
          } else {
            authService.clearToken();
            setIsAuthenticated(false);
          }
          setIsVerifyingAuth(false);
        }
      } catch (e) {
        if (mounted) {
          setIsAuthenticated(false);
          setIsVerifyingAuth(false);
        }
      }
    };

    verifyAuth();
    const handleExpiredSession = () => { authService.clearToken(); };
    window.addEventListener('nexus:unauthorized', handleExpiredSession);

    const unsubscribe = authService.subscribe((token) => {
      if (!token) {
        setIsAuthenticated(false);
        wsClient.disconnect();
      }
    });

    return () => {
      mounted = false;
      window.removeEventListener('nexus:unauthorized', handleExpiredSession);
      unsubscribe();
    };
  }, []);

  // Initialize WebSocket connection & listeners ONLY when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

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
  }, [isAuthenticated, soundEnabled]);

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
    if (!isAuthenticated) return;
    fetchContainers();
    fetchVirtualization();
    const interval = setInterval(() => {
      if (activeTab === 'containers') {
        fetchContainers();
        fetchVirtualization();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [isAuthenticated, activeTab]);

  // Local uptime increment timer
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(() => {
      setUptimeSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  const totalInstancesCount = (containers?.length || 0) + (virtualization?.vms?.length || 0);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'overview', label: '서버 현황', icon: <Layers className="w-4 h-4" /> },
    { key: 'downloads', label: '다운로드', icon: <Download className="w-4 h-4" /> },
    { key: 'charts', label: '사용량 추이', icon: <LineChart className="w-4 h-4" /> },
    { key: 'containers', label: '컨테이너·VM', icon: <Box className="w-4 h-4" /> },
    { key: 'processes', label: '프로세스', icon: <Terminal className="w-4 h-4" /> },
    { key: 'logs', label: '시스템 로그', icon: <Activity className="w-4 h-4" /> },
    { key: 'ports', label: '네트워크 포트', icon: <Radio className="w-4 h-4" /> },
    { key: 'benchmark', label: '성능 테스트', icon: <Flame className="w-4 h-4" /> },
  ];

  // 1. Verifying active session token
  if (isVerifyingAuth) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center text-slate-100 font-sans">
        <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] mb-4 shadow-xl">
          <ShieldAlert className="w-7 h-7 text-[var(--accent-primary)] animate-pulse" />
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-sub)]">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-ping" />
          <span>보안 세션 검증 중... (Verifying Security Perimeter)</span>
        </div>
      </div>
    );
  }

  // 2. Not Authenticated -> Full-Screen Lock Screen & Login Gatekeeper
  if (!isAuthenticated) {
    return (
      <LoginGate
        onLoginSuccess={() => {
          setIsAuthenticated(true);
        }}
      />
    );
  }

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
        onLock={async () => {
          await authService.logout();
          setIsAuthenticated(false);
          wsClient.disconnect();
        }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 flex flex-col">
        
        {/* Active Alerts Banner */}
        {(activeTab === 'overview' || alerts.length > 0) && <AlertsBanner
          alerts={alerts}
          rules={rules}
          onUpdateRules={(newRules) => setRules(newRules)}
        />}

        {/* Hero Cards (Always visible on top) */}

        {/* Navigation Tabs Segmented Dock */}
        <nav aria-label="주요 메뉴" className="p-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl mb-6 shadow-sm">
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setActiveTab(tab.key);
                    sound.playTabSwitch();
                  }}
                  className={`flex flex-col sm:flex-row justify-center items-center gap-1.5 px-1 sm:px-2 py-3 min-h-12 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-[var(--bg-primary)] text-[var(--accent-primary)] border border-[var(--border-focus)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {['overview', 'charts'].includes(activeTab) && <HeroCards metrics={metrics} history={history} />}

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
                    sensors={metrics.sensors}
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

          {activeTab === 'downloads' && <DownloadCenter />}

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
      <footer className="bg-[var(--bg-primary)] border-t border-[var(--border-color)] py-3 px-6 text-xs font-mono text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          <span className="text-[var(--text-sub)]">NexusPulse OS v1.0.0</span>
          <span>•</span>
          <span>Node {overview?.nodeVersion || 'v22'}</span>
          <span>•</span>
          <span className="text-[var(--accent-primary)] whitespace-nowrap">서버 관리</span>
        </div>
        <div>
          실시간 서버 상태 및 다운로드 관리
        </div>
      </footer>

    </div>
  );
};
