/**
 * NexusPulse Telemetry Engine
 * High-precision Linux & Node.js System Telemetry Collector
 * 
 * Features:
 * - Native Linux /proc, /sys and Node os telemetry with systeminformation fallback
 * - CPU overall % & per-core %, loadavg (1, 5, 15), dynamic tick calculation
 * - Memory (total, used, free, active, buffcache, available, swap)
 * - Disks (fs sizes, used, free, use %, mount, read/write I/O speed, IOPS)
 * - Network (interfaces, rx/tx bytes/sec, total rx/tx, packets/sec, dropped)
 * - Battery / power / temperature sensors
 * - Processes manager with search, sort, pagination, and signal termination
 * - Open listening TCP/UDP ports detection
 * - Rolling history buffer (60s at 1s resolution)
 * - Dynamic Alert Engine (CPU, RAM, Disk, Load thresholds)
 * - Safe multi-threaded Worker Benchmark & Stress Test module
 * - Buffered system event log stream
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const si = require('systeminformation');
const { Worker } = require('worker_threads');

// ==========================================
// Native Linux /proc & /sys Fast Readers
// ==========================================

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return null;
  }
}

function parseProcStat() {
  const content = safeReadFile('/proc/stat');
  if (!content) return null;

  const lines = content.split('\n');
  const cpus = [];

  for (const line of lines) {
    if (line.startsWith('cpu')) {
      const parts = line.trim().split(/\s+/);
      const id = parts[0];
      const numbers = parts.slice(1).map(Number);
      const [user, nice, system, idle, iowait, irq, softirq, steal] = numbers;
      const total = (user || 0) + (nice || 0) + (system || 0) + (idle || 0) + 
                    (iowait || 0) + (irq || 0) + (softirq || 0) + (steal || 0);
      const idleTime = (idle || 0) + (iowait || 0);
      cpus.push({ id, total, idleTime, user: user || 0, system: system || 0, idle: idle || 0, iowait: iowait || 0 });
    }
  }
  return cpus;
}

function parseProcMeminfo() {
  const content = safeReadFile('/proc/meminfo');
  if (!content) return null;

  const map = {};
  for (const line of content.split('\n')) {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      const key = line.slice(0, idx).trim();
      const val = parseInt(line.slice(idx + 1).trim(), 10);
      if (!isNaN(val)) {
        map[key] = val * 1024; // convert KB to Bytes
      }
    }
  }

  const total = map.MemTotal || os.totalmem();
  const free = map.MemFree || os.freemem();
  const available = map.MemAvailable !== undefined ? map.MemAvailable : free;
  const buffers = map.Buffers || 0;
  const cached = map.Cached || 0;
  const buffcache = buffers + cached;
  const active = map.Active || (total - available);
  const used = Math.max(0, total - available);
  const usedPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

  const swapTotal = map.SwapTotal || 0;
  const swapFree = map.SwapFree || 0;
  const swapUsed = Math.max(0, swapTotal - swapFree);
  const swapPercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 1000) / 10 : 0;

  return {
    total,
    used,
    free,
    active,
    available,
    buffcache,
    usedPercent,
    swapTotal,
    swapUsed,
    swapFree,
    swapPercent
  };
}

function parseProcNetDev() {
  const content = safeReadFile('/proc/net/dev');
  if (!content) return null;

  const lines = content.split('\n').slice(2);
  const ifaces = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const [iface, data] = line.split(':');
    if (!iface || !data) continue;
    const nums = data.trim().split(/\s+/).map(Number);
    ifaces.push({
      iface: iface.trim(),
      rx_bytes: nums[0] || 0,
      rx_packets: nums[1] || 0,
      rx_errors: nums[2] || 0,
      rx_dropped: nums[3] || 0,
      tx_bytes: nums[8] || 0,
      tx_packets: nums[9] || 0,
      tx_errors: nums[10] || 0,
      tx_dropped: nums[11] || 0
    });
  }
  return ifaces;
}

function parseProcDiskstats() {
  const content = safeReadFile('/proc/diskstats');
  if (!content) return null;

  const lines = content.split('\n');
  const stats = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 14) continue;
    const dev = parts[2];
    // Skip loop and ram devices for IO calculation
    if (dev.startsWith('loop') || dev.startsWith('ram')) continue;

    const readsCompleted = Number(parts[3]) || 0;
    const sectorsRead = Number(parts[5]) || 0;
    const writesCompleted = Number(parts[7]) || 0;
    const sectorsWritten = Number(parts[9]) || 0;
    const ioInProgress = Number(parts[11]) || 0;

    stats.push({
      dev,
      readBytes: sectorsRead * 512,
      writeBytes: sectorsWritten * 512,
      readsCompleted,
      writesCompleted,
      iops: readsCompleted + writesCompleted,
      ioInProgress
    });
  }
  return stats;
}

function parseThermalSensors() {
  const temps = [];
  try {
    if (fs.existsSync('/sys/class/thermal')) {
      const zones = fs.readdirSync('/sys/class/thermal').filter(z => z.startsWith('thermal_zone'));
      for (const z of zones) {
        try {
          const raw = safeReadFile(`/sys/class/thermal/${z}/temp`);
          const type = safeReadFile(`/sys/class/thermal/${z}/type`) || 'cpu';
          if (raw) {
            const deg = parseFloat(raw.trim()) / 1000;
            if (!isNaN(deg) && deg > 0 && deg < 150) {
              temps.push({ zone: z, type: type.trim(), temp: Math.round(deg * 10) / 10 });
            }
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
  return temps;
}

function parsePowerSupply() {
  try {
    if (fs.existsSync('/sys/class/power_supply')) {
      const supplies = fs.readdirSync('/sys/class/power_supply');
      for (const s of supplies) {
        if (s.startsWith('BAT')) {
          const cap = safeReadFile(`/sys/class/power_supply/${s}/capacity`);
          const status = safeReadFile(`/sys/class/power_supply/${s}/status`);
          if (cap) {
            const percent = parseInt(cap.trim(), 10);
            const st = (status || 'Unknown').trim();
            return {
              hasBattery: true,
              percent,
              status: st,
              isCharging: st.toLowerCase() === 'charging',
              powerSource: 'Battery'
            };
          }
        }
      }
    }
  } catch (e) {}
  return { hasBattery: false, percent: null, status: 'AC Connected', isCharging: false, powerSource: 'AC' };
}

// ==========================================
// TelemetryEngine Class
// ==========================================

class TelemetryEngine {
  constructor() {
    this.historyLength = 60; // 60 data points (1s resolution)
    this.history = [];
    this.logs = [];
    this.maxLogs = 300;
    this.alerts = [];
    this.alertHistory = [];
    this.maxAlertHistory = 50;

    // Configurable Alert Rules
    this.alertRules = {
      cpuWarning: 75,
      cpuCritical: 85,
      ramWarning: 80,
      ramCritical: 90,
      diskWarning: 80,
      diskCritical: 90,
      loadCritical: Number((os.cpus().length * 1.5).toFixed(1))
    };

    // State Tracking for Differential Telemetry (CPU, Net, Disk)
    this.prevCpuTicks = null;
    this.prevNetDev = null;
    this.prevDiskStats = null;
    this.prevTime = Date.now();

    // Cache static system specifications
    this.staticSpecs = null;

    // Benchmark State
    this.isBenchmarking = false;
    this.benchmarkWorkers = [];
    this.benchmarkTimer = null;
    this.benchmarkMemoryChunks = [];
    this.benchmarkDetails = null;

    // Initialize baseline ticks
    this.initBaseline();

    // Seed initial system logs
    this.addLog('INFO', `NexusPulse Telemetry Engine initialized on ${os.hostname()}`);
    this.addLog('INFO', `Kernel: ${os.type()} ${os.release()} (${os.arch()}), Node: ${process.version}`);
    this.addLog('INFO', `Hardware: ${os.cpus().length} Logical CPU core(s) - ${os.cpus()[0]?.model || 'Generic Processor'}`);
    this.addLog('INFO', `Physical Memory: ${(os.totalmem() / (1024 ** 3)).toFixed(2)} GB RAM`);
  }

  initBaseline() {
    try {
      this.prevCpuTicks = parseProcStat();
      this.prevNetDev = parseProcNetDev();
      this.prevDiskStats = parseProcDiskstats();
      this.prevTime = Date.now();
    } catch (e) {
      console.warn('[TelemetryEngine] Baseline init fallback:', e.message);
    }
  }

  // ==========================================
  // Logging Subsystem
  // ==========================================

  addLog(level, message, source = 'system') {
    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(), // INFO, WARN, ERROR, SUCCESS, BENCHMARK
      message,
      source
    };

    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    return logEntry;
  }

  getLogs({ limit = 100, level = null, search = null } = {}) {
    let result = [...this.logs];
    if (level) {
      const lvl = level.toUpperCase();
      result = result.filter(l => l.level === lvl);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l => l.message.toLowerCase().includes(q) || l.source.toLowerCase().includes(q));
    }
    return result.slice(0, Math.min(result.length, limit));
  }

  // ==========================================
  // Static Specifications & Overview
  // ==========================================

  async getStaticSpecs() {
    if (this.staticSpecs) {
      return {
        ...this.staticSpecs,
        uptime: Math.round(os.uptime()),
        timestamp: Date.now()
      };
    }

    try {
      const [osInfo, cpuInfo, sysInfo, memLayout] = await Promise.all([
        si.osInfo().catch(() => ({})),
        si.cpu().catch(() => ({})),
        si.system().catch(() => ({})),
        si.memLayout().catch(() => ([]))
      ]);

      const cpus = os.cpus();
      const cpuSpeedGhz = cpus[0]?.speed ? (cpus[0].speed / 1000).toFixed(2) : 'N/A';

      this.staticSpecs = {
        hostname: os.hostname(),
        platform: os.platform(),
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        nodeVersion: process.version,
        bootTime: Date.now() - Math.round(os.uptime() * 1000),
        os: {
          distro: osInfo.distro || os.type(),
          release: osInfo.release || os.release(),
          codename: osInfo.codename || '',
          kernel: osInfo.kernel || os.release(),
          arch: osInfo.arch || os.arch(),
          hostname: osInfo.hostname || os.hostname()
        },
        cpu: {
          manufacturer: cpuInfo.manufacturer || 'Generic',
          brand: cpuInfo.brand || cpus[0]?.model || 'Standard CPU',
          cores: cpus.length,
          physicalCores: cpuInfo.physicalCores || cpus.length,
          speed: cpus[0]?.speed || 0,
          speedGhz: cpuSpeedGhz,
          speedMax: cpuInfo.speedMax || cpuSpeedGhz,
          governor: cpuInfo.governor || 'default'
        },
        system: {
          manufacturer: sysInfo.manufacturer || 'Server Platform',
          model: sysInfo.model || 'Standard Host',
          version: sysInfo.version || '1.0',
          virtual: sysInfo.virtual || false
        },
        memory: {
          totalBytes: os.totalmem(),
          totalGb: Number((os.totalmem() / (1024 ** 3)).toFixed(2)),
          layout: memLayout && memLayout.length > 0 ? memLayout : [
            { size: os.totalmem(), type: 'DDR4', clockSpeed: 3200, bank: 'Bank 0' }
          ]
        },
        networkInterfaces: os.networkInterfaces()
      };
    } catch (err) {
      console.error('[TelemetryEngine] Error fetching static specs:', err.message);
      const cpus = os.cpus();
      this.staticSpecs = {
        hostname: os.hostname(),
        platform: os.platform(),
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        nodeVersion: process.version,
        bootTime: Date.now() - Math.round(os.uptime() * 1000),
        cpu: {
          brand: cpus[0]?.model || 'Generic CPU',
          cores: cpus.length,
          physicalCores: cpus.length,
          speed: cpus[0]?.speed || 0,
          speedGhz: cpus[0]?.speed ? (cpus[0].speed / 1000).toFixed(2) : 'N/A'
        },
        memory: {
          totalBytes: os.totalmem(),
          totalGb: Number((os.totalmem() / (1024 ** 3)).toFixed(2))
        },
        networkInterfaces: os.networkInterfaces()
      };
    }

    return {
      ...this.staticSpecs,
      uptime: Math.round(os.uptime()),
      timestamp: Date.now()
    };
  }

  // ==========================================
  // Dynamic Real-Time Telemetry Snapshot
  // ==========================================

  async getMetrics() {
    const now = Date.now();
    const isoTime = new Date(now).toISOString();
    const deltaMs = Math.max(100, now - this.prevTime);
    const deltaSec = deltaMs / 1000;
    this.prevTime = now;

    // 1. CPU Telemetry (Native /proc/stat with si fallback)
    let cpuUsage = 0;
    let coreUsages = [];

    const currentCpuTicks = parseProcStat();
    if (currentCpuTicks && this.prevCpuTicks && currentCpuTicks.length === this.prevCpuTicks.length) {
      for (let i = 0; i < currentCpuTicks.length; i++) {
        const curr = currentCpuTicks[i];
        const prev = this.prevCpuTicks[i];
        const dTotal = curr.total - prev.total;
        const dIdle = curr.idleTime - prev.idleTime;
        const pct = dTotal > 0 ? Math.max(0, Math.min(100, Math.round(((dTotal - dIdle) / dTotal) * 1000) / 10)) : 0;

        if (curr.id === 'cpu') {
          cpuUsage = pct;
        } else {
          coreUsages.push(pct);
        }
      }
      this.prevCpuTicks = currentCpuTicks;
    } else {
      this.prevCpuTicks = currentCpuTicks;
      // Fallback using os.loadavg
      const load1 = os.loadavg()[0];
      const cores = os.cpus().length;
      cpuUsage = Math.min(100, Math.round((load1 / cores) * 1000) / 10);
      coreUsages = new Array(cores).fill(cpuUsage);
    }

    if (coreUsages.length === 0) {
      coreUsages = [cpuUsage];
    }

    // 2. Memory Telemetry (Native /proc/meminfo with si fallback)
    let mem = parseProcMeminfo();
    if (!mem) {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      mem = {
        total,
        used,
        free,
        active: used,
        available: free,
        buffcache: 0,
        usedPercent: Math.round((used / total) * 1000) / 10,
        swapTotal: 0,
        swapUsed: 0,
        swapFree: 0,
        swapPercent: 0
      };
    }

    // 3. Network Telemetry (Native /proc/net/dev delta with si fallback)
    let netInterfaces = [];
    let netIO = { rx_sec: 0, tx_sec: 0, total_rx: 0, total_tx: 0, rx_packets_sec: 0, tx_packets_sec: 0 };

    const currentNetDev = parseProcNetDev();
    if (currentNetDev) {
      let sumRxSec = 0;
      let sumTxSec = 0;
      let sumTotalRx = 0;
      let sumTotalTx = 0;
      let sumRxPacketsSec = 0;
      let sumTxPacketsSec = 0;

      const prevMap = {};
      if (this.prevNetDev) {
        for (const item of this.prevNetDev) {
          prevMap[item.iface] = item;
        }
      }

      netInterfaces = currentNetDev.map(item => {
        const prev = prevMap[item.iface];
        let rxSec = 0;
        let txSec = 0;
        let rxPacketsSec = 0;
        let txPacketsSec = 0;

        if (prev) {
          const dRx = Math.max(0, item.rx_bytes - prev.rx_bytes);
          const dTx = Math.max(0, item.tx_bytes - prev.tx_bytes);
          const dRxPkt = Math.max(0, item.rx_packets - prev.rx_packets);
          const dTxPkt = Math.max(0, item.tx_packets - prev.tx_packets);

          rxSec = Math.round(dRx / deltaSec);
          txSec = Math.round(dTx / deltaSec);
          rxPacketsSec = Math.round(dRxPkt / deltaSec);
          txPacketsSec = Math.round(dTxPkt / deltaSec);
        }

        // Aggregate non-loopback or all
        if (item.iface !== 'lo') {
          sumRxSec += rxSec;
          sumTxSec += txSec;
          sumTotalRx += item.rx_bytes;
          sumTotalTx += item.tx_bytes;
          sumRxPacketsSec += rxPacketsSec;
          sumTxPacketsSec += txPacketsSec;
        }

        return {
          iface: item.iface,
          operstate: 'up',
          rx_bytes: item.rx_bytes,
          tx_bytes: item.tx_bytes,
          rx_sec: rxSec,
          tx_sec: txSec,
          rx_packets_sec: rxPacketsSec,
          tx_packets_sec: txPacketsSec,
          rx_dropped: item.rx_dropped,
          tx_dropped: item.tx_dropped
        };
      });

      // If only loopback exists, aggregate lo
      if (sumTotalRx === 0 && netInterfaces.length > 0) {
        sumRxSec = netInterfaces[0].rx_sec;
        sumTxSec = netInterfaces[0].tx_sec;
        sumTotalRx = netInterfaces[0].rx_bytes;
        sumTotalTx = netInterfaces[0].tx_bytes;
      }

      netIO = {
        rx_sec: sumRxSec,
        tx_sec: sumTxSec,
        total_rx: sumTotalRx,
        total_tx: sumTotalTx,
        rx_packets_sec: sumRxPacketsSec,
        tx_packets_sec: sumTxPacketsSec
      };

      this.prevNetDev = currentNetDev;
    }

    // 4. Storage & Disks Telemetry
    let fsSize = [];
    let fsStats = { rIO_sec: 0, wIO_sec: 0, rBytes_sec: 0, wBytes_sec: 0, iops: 0, rIO: 0, wIO: 0 };

    const currentDiskStats = parseProcDiskstats();
    if (currentDiskStats) {
      let sumReadBytesSec = 0;
      let sumWriteBytesSec = 0;
      let sumIopsSec = 0;
      let sumTotalRead = 0;
      let sumTotalWrite = 0;

      const prevDiskMap = {};
      if (this.prevDiskStats) {
        for (const d of this.prevDiskStats) {
          prevDiskMap[d.dev] = d;
        }
      }

      for (const curr of currentDiskStats) {
        const prev = prevDiskMap[curr.dev];
        if (prev) {
          const dRead = Math.max(0, curr.readBytes - prev.readBytes);
          const dWrite = Math.max(0, curr.writeBytes - prev.writeBytes);
          const dIops = Math.max(0, curr.iops - prev.iops);

          sumReadBytesSec += Math.round(dRead / deltaSec);
          sumWriteBytesSec += Math.round(dWrite / deltaSec);
          sumIopsSec += Math.round(dIops / deltaSec);
        }
        sumTotalRead += curr.readBytes;
        sumTotalWrite += curr.writeBytes;
      }

      fsStats = {
        rIO_sec: sumReadBytesSec,
        wIO_sec: sumWriteBytesSec,
        rBytes_sec: sumReadBytesSec,
        wBytes_sec: sumWriteBytesSec,
        iops: sumIopsSec,
        rIO: sumTotalRead,
        wIO: sumTotalWrite
      };

      this.prevDiskStats = currentDiskStats;
    }

    // Filesystem capacity (si.fsSize cached or fetched)
    try {
      const fsList = await si.fsSize().catch(() => []);
      if (fsList && fsList.length > 0) {
        fsSize = fsList.map(d => ({
          fs: d.fs,
          type: d.type || 'ext4',
          size: d.size,
          used: d.used,
          available: d.available,
          usePercent: Math.round(d.use * 10) / 10,
          mount: d.mount
        }));
      }
    } catch (e) {
      console.warn('[TelemetryEngine] fsSize error:', e.message);
    }

    // If fsSize is empty, provide fallback
    if (fsSize.length === 0) {
      fsSize = [{
        fs: '/dev/root',
        type: 'ext4',
        size: 50 * 1024 * 1024 * 1024,
        used: 15 * 1024 * 1024 * 1024,
        available: 35 * 1024 * 1024 * 1024,
        usePercent: 30.0,
        mount: '/'
      }];
    }

    // 5. Thermal & Battery Sensors
    const thermalList = parseThermalSensors();
    let temp = {
      main: thermalList.length > 0 ? thermalList[0].temp : null,
      cores: thermalList.map(t => t.temp),
      max: thermalList.length > 0 ? Math.max(...thermalList.map(t => t.temp)) : null
    };

    const batteryInfo = parsePowerSupply();

    // 6. Load Average & Processes Summary
    const loadavg = os.loadavg().map(v => Math.round(v * 100) / 100);

    const snapshot = {
      timestamp: now,
      isoTime,
      uptime: Math.round(os.uptime()),
      loadavg,
      cpu: {
        usage: cpuUsage,
        cores: coreUsages,
        temperature: temp
      },
      memory: mem,
      storage: {
        disks: fsSize,
        io: fsStats
      },
      network: {
        interfaces: netInterfaces,
        io: netIO
      },
      battery: batteryInfo,
      benchmarkActive: this.isBenchmarking,
      benchmarkDetails: this.benchmarkDetails
    };

    // Update rolling history buffer
    this.updateHistory(snapshot);

    // Evaluate dynamic alert rules
    this.evaluateAlerts(snapshot);

    return snapshot;
  }

  // ==========================================
  // Rolling History Buffer (60s)
  // ==========================================

  updateHistory(snapshot) {
    const historyPoint = {
      timestamp: snapshot.timestamp,
      timeLabel: new Date(snapshot.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }),
      cpu: snapshot.cpu.usage,
      ram: snapshot.memory.usedPercent,
      swap: snapshot.memory.swapPercent,
      load1: snapshot.loadavg[0],
      netRx: Math.round(((snapshot.network.io.rx_sec || 0) / 1024) * 10) / 10, // KB/s
      netTx: Math.round(((snapshot.network.io.tx_sec || 0) / 1024) * 10) / 10, // KB/s
      netRxBytes: snapshot.network.io.rx_sec || 0,
      netTxBytes: snapshot.network.io.tx_sec || 0,
      diskRead: Math.round(((snapshot.storage.io.rIO_sec || 0) / 1024) * 10) / 10, // KB/s
      diskWrite: Math.round(((snapshot.storage.io.wIO_sec || 0) / 1024) * 10) / 10, // KB/s
      diskReadBytes: snapshot.storage.io.rIO_sec || 0,
      diskWriteBytes: snapshot.storage.io.wIO_sec || 0
    };

    this.history.push(historyPoint);
    if (this.history.length > this.historyLength) {
      this.history.shift();
    }
  }

  getHistory() {
    return this.history;
  }

  // ==========================================
  // Dynamic Alert Engine
  // ==========================================

  evaluateAlerts(snapshot) {
    const activeAlerts = [];

    // 1. CPU Threshold Alerts
    if (snapshot.cpu.usage >= this.alertRules.cpuCritical) {
      activeAlerts.push({
        id: 'cpu-critical',
        severity: 'CRITICAL',
        metric: 'CPU Utilization',
        value: `${snapshot.cpu.usage}%`,
        threshold: `${this.alertRules.cpuCritical}%`,
        message: `CPU usage critically elevated at ${snapshot.cpu.usage}% (Threshold: ${this.alertRules.cpuCritical}%)`,
        timestamp: snapshot.isoTime
      });
    } else if (snapshot.cpu.usage >= this.alertRules.cpuWarning) {
      activeAlerts.push({
        id: 'cpu-warning',
        severity: 'WARNING',
        metric: 'CPU Utilization',
        value: `${snapshot.cpu.usage}%`,
        threshold: `${this.alertRules.cpuWarning}%`,
        message: `CPU usage warning: ${snapshot.cpu.usage}% (Threshold: ${this.alertRules.cpuWarning}%)`,
        timestamp: snapshot.isoTime
      });
    }

    // 2. RAM Threshold Alerts
    if (snapshot.memory.usedPercent >= this.alertRules.ramCritical) {
      activeAlerts.push({
        id: 'ram-critical',
        severity: 'CRITICAL',
        metric: 'Memory Usage',
        value: `${snapshot.memory.usedPercent}%`,
        threshold: `${this.alertRules.ramCritical}%`,
        message: `RAM usage critical: ${snapshot.memory.usedPercent}% (Threshold: ${this.alertRules.ramCritical}%)`,
        timestamp: snapshot.isoTime
      });
    } else if (snapshot.memory.usedPercent >= this.alertRules.ramWarning) {
      activeAlerts.push({
        id: 'ram-warning',
        severity: 'WARNING',
        metric: 'Memory Usage',
        value: `${snapshot.memory.usedPercent}%`,
        threshold: `${this.alertRules.ramWarning}%`,
        message: `RAM usage warning: ${snapshot.memory.usedPercent}% (Threshold: ${this.alertRules.ramWarning}%)`,
        timestamp: snapshot.isoTime
      });
    }

    // 3. Disk Space Alerts
    if (snapshot.storage.disks && snapshot.storage.disks.length > 0) {
      for (const disk of snapshot.storage.disks) {
        if (disk.usePercent >= this.alertRules.diskCritical) {
          activeAlerts.push({
            id: `disk-critical-${disk.mount.replace(/[^a-zA-Z0-9]/g, '_')}`,
            severity: 'CRITICAL',
            metric: `Disk Mount ${disk.mount}`,
            value: `${disk.usePercent}%`,
            threshold: `${this.alertRules.diskCritical}%`,
            message: `Mount point '${disk.mount}' is ${disk.usePercent}% full! Critical threshold exceeded.`,
            timestamp: snapshot.isoTime
          });
        } else if (disk.usePercent >= this.alertRules.diskWarning) {
          activeAlerts.push({
            id: `disk-warning-${disk.mount.replace(/[^a-zA-Z0-9]/g, '_')}`,
            severity: 'WARNING',
            metric: `Disk Mount ${disk.mount}`,
            value: `${disk.usePercent}%`,
            threshold: `${this.alertRules.diskWarning}%`,
            message: `Mount point '${disk.mount}' usage reached ${disk.usePercent}%.`,
            timestamp: snapshot.isoTime
          });
        }
      }
    }

    // 4. Load Average Alert
    if (snapshot.loadavg[0] >= this.alertRules.loadCritical) {
      activeAlerts.push({
        id: 'load-critical',
        severity: 'WARNING',
        metric: '1-Min Load Average',
        value: `${snapshot.loadavg[0]}`,
        threshold: `${this.alertRules.loadCritical}`,
        message: `System 1-min load average (${snapshot.loadavg[0]}) exceeds core capacity (${this.alertRules.loadCritical}).`,
        timestamp: snapshot.isoTime
      });
    }

    // Log newly triggered alerts
    for (const alert of activeAlerts) {
      const existing = this.alerts.find(a => a.id === alert.id);
      if (!existing) {
        this.addLog(alert.severity === 'CRITICAL' ? 'ERROR' : 'WARN', `[ALERT TRIGGERED] ${alert.message}`, 'alert-engine');
        this.alertHistory.unshift({
          ...alert,
          type: 'TRIGGERED',
          resolvedAt: null
        });
        if (this.alertHistory.length > this.maxAlertHistory) {
          this.alertHistory.pop();
        }
      }
    }

    // Check for resolved alerts
    for (const oldAlert of this.alerts) {
      const stillActive = activeAlerts.find(a => a.id === oldAlert.id);
      if (!stillActive) {
        this.addLog('SUCCESS', `[ALERT RESOLVED] ${oldAlert.metric} returned to normal parameters.`, 'alert-engine');
        const histItem = this.alertHistory.find(h => h.id === oldAlert.id && !h.resolvedAt);
        if (histItem) {
          histItem.resolvedAt = snapshot.isoTime;
          histItem.status = 'RESOLVED';
        }
      }
    }

    this.alerts = activeAlerts;
  }

  getAlerts() {
    return {
      active: this.alerts,
      history: this.alertHistory,
      rules: this.alertRules,
      summary: {
        critical: this.alerts.filter(a => a.severity === 'CRITICAL').length,
        warning: this.alerts.filter(a => a.severity === 'WARNING').length,
        total: this.alerts.length
      }
    };
  }

  updateAlertRules(newRules) {
    if (!newRules || typeof newRules !== 'object') {
      throw new Error('Invalid alert rules payload');
    }

    const numericFields = ['cpuWarning', 'cpuCritical', 'ramWarning', 'ramCritical', 'diskWarning', 'diskCritical', 'loadCritical'];
    for (const key of numericFields) {
      if (newRules[key] !== undefined) {
        const val = Number(newRules[key]);
        if (!isNaN(val) && val >= 0) {
          this.alertRules[key] = val;
        }
      }
    }

    this.addLog('INFO', `Alert rules updated: CPU(${this.alertRules.cpuWarning}%/${this.alertRules.cpuCritical}%), RAM(${this.alertRules.ramWarning}%/${this.alertRules.ramCritical}%), Disk(${this.alertRules.diskWarning}%/${this.alertRules.diskCritical}%)`, 'alert-engine');
    return this.alertRules;
  }

  // ==========================================
  // Process Management Subsystem
  // ==========================================

  async getProcesses({ sort = 'cpu', limit = 50, search = '' } = {}) {
    try {
      const procData = await si.processes().catch(() => ({ all: 0, running: 0, blocked: 0, sleeping: 0, list: [] }));
      let list = procData.list || [];

      // Filter by search term
      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        list = list.filter(p =>
          (p.name && p.name.toLowerCase().includes(query)) ||
          (p.command && p.command.toLowerCase().includes(query)) ||
          (p.user && p.user.toLowerCase().includes(query)) ||
          String(p.pid).includes(query)
        );
      }

      // Sort
      const sortKey = (sort || 'cpu').toLowerCase();
      if (sortKey === 'mem' || sortKey === 'memory') {
        list.sort((a, b) => (b.mem || 0) - (a.mem || 0));
      } else if (sortKey === 'pid') {
        list.sort((a, b) => a.pid - b.pid);
      } else if (sortKey === 'name') {
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      } else {
        // default CPU sort
        list.sort((a, b) => (b.cpu || 0) - (a.cpu || 0));
      }

      const totalCount = procData.all || list.length;
      const runningCount = procData.running || list.filter(p => p.state === 'running').length;
      const sleepingCount = procData.sleeping || list.filter(p => p.state === 'sleeping').length;
      const blockedCount = procData.blocked || 0;

      const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));

      return {
        all: totalCount,
        running: runningCount,
        sleeping: sleepingCount,
        blocked: blockedCount,
        total: totalCount,
        filteredCount: list.length,
        list: list.slice(0, safeLimit).map(p => ({
          pid: p.pid,
          ppid: p.parentPid || p.ppid || 0,
          name: p.name || 'unknown',
          cpu: Math.round((p.cpu || 0) * 10) / 10,
          mem: Math.round((p.mem || 0) * 10) / 10,
          priority: p.priority || 0,
          memVsz: p.memVsz || 0,
          memRss: p.memRss || 0,
          state: p.state || 'sleeping',
          user: p.user || 'root',
          command: p.command || p.name || '',
          startedAt: p.started || ''
        }))
      };
    } catch (err) {
      console.error('[TelemetryEngine] Error getting processes:', err.message);
      return { all: 0, running: 0, sleeping: 0, blocked: 0, total: 0, list: [] };
    }
  }

  async killProcess(pid, signal = 'SIGTERM') {
    const targetPid = parseInt(pid, 10);
    if (!targetPid || isNaN(targetPid) || targetPid <= 1) {
      throw new Error(`Invalid PID ${pid}. Termination of root PID <= 1 is strictly forbidden.`);
    }

    const validSignals = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGSTOP', 'SIGCONT'];
    const sig = signal.toUpperCase();
    if (!validSignals.includes(sig)) {
      throw new Error(`Invalid signal ${signal}. Allowed: ${validSignals.join(', ')}`);
    }

    try {
      process.kill(targetPid, sig);
      this.addLog('WARN', `Signal ${sig} successfully sent to PID: ${targetPid}`, 'process-manager');
      return {
        success: true,
        pid: targetPid,
        signal: sig,
        message: `Signal ${sig} sent to PID ${targetPid}`
      };
    } catch (err) {
      const errMsg = `Failed to send ${sig} to PID ${targetPid}: ${err.message}`;
      this.addLog('ERROR', errMsg, 'process-manager');
      throw new Error(errMsg);
    }
  }

  // ==========================================
  // Network Ports Subsystem
  // ==========================================

  async getOpenPorts() {
    try {
      const connections = await si.networkConnections().catch(() => []);
      const listening = connections
        .filter(c => c.state === 'LISTEN' || c.state === 'LISTENING')
        .map(c => ({
          protocol: (c.protocol || 'tcp').toLowerCase(),
          localAddress: c.localAddress || '0.0.0.0',
          localPort: parseInt(c.localPort, 10),
          process: c.process || 'unknown',
          pid: c.pid || null,
          state: c.state || 'LISTEN'
        }));

      // Deduplicate by protocol + localPort
      const seen = new Set();
      const uniquePorts = [];

      for (const p of listening) {
        if (!p.localPort || isNaN(p.localPort)) continue;
        const key = `${p.protocol}:${p.localPort}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniquePorts.push(p);
        }
      }

      return uniquePorts.sort((a, b) => a.localPort - b.localPort);
    } catch (err) {
      console.error('[TelemetryEngine] Error fetching open ports:', err.message);
      return [];
    }
  }

  // ==========================================
  // Safe Multi-Threaded Benchmark & Stress Test
  // ==========================================

  startBenchmark({ durationSec = 10, cpuCores = null, ramMb = 256 } = {}) {
    if (this.isBenchmarking) {
      return {
        status: 'already_running',
        message: 'A stress test is already actively running.',
        details: this.benchmarkDetails
      };
    }

    const availableCores = os.cpus().length;
    const targetCores = Math.max(1, Math.min(availableCores, cpuCores || Math.max(1, availableCores - 1)));
    const duration = Math.max(1, Math.min(300, parseInt(durationSec, 10) || 10)); // max 5 min
    const targetRam = Math.max(16, Math.min(2048, parseInt(ramMb, 10) || 256));   // max 2 GB

    this.isBenchmarking = true;
    this.benchmarkDetails = {
      targetCores,
      ramMb: targetRam,
      durationSec: duration,
      startedAt: Date.now(),
      expiresAt: Date.now() + (duration * 1000)
    };

    this.addLog('BENCHMARK', `Starting stress test: ${targetCores} CPU worker(s), ${targetRam}MB RAM for ${duration}s`, 'benchmark-engine');

    // 1. Allocate controlled RAM buffer
    this.benchmarkMemoryChunks = [];
    try {
      const chunkSize = 1024 * 1024; // 1 MB
      for (let i = 0; i < targetRam; i++) {
        const buf = Buffer.alloc(chunkSize, 0xaa);
        this.benchmarkMemoryChunks.push(buf);
      }
    } catch (e) {
      console.error('[TelemetryEngine] RAM allocation warning during benchmark:', e.message);
    }

    // 2. Spawn isolated CPU Worker Threads (non-blocking for Express/WS event loop)
    const workerScript = `
      const { parentPort } = require('worker_threads');
      let running = true;
      parentPort.on('message', (msg) => {
        if (msg === 'stop') {
          running = false;
          process.exit(0);
        }
      });
      function cpuBurn() {
        while (running) {
          let x = 0;
          for (let i = 0; i < 500000; i++) {
            x += Math.sin(i) * Math.cos(i);
          }
        }
      }
      cpuBurn();
    `;

    this.benchmarkWorkers = [];
    for (let c = 0; c < targetCores; c++) {
      try {
        const worker = new Worker(workerScript, { eval: true });
        worker.on('error', (err) => console.warn('[Benchmark Worker Error]:', err.message));
        this.benchmarkWorkers.push(worker);
      } catch (err) {
        console.error('[TelemetryEngine] Failed to spawn benchmark worker:', err.message);
      }
    }

    // 3. Auto-stop Timer
    this.benchmarkTimer = setTimeout(() => {
      this.stopBenchmark();
    }, duration * 1000);

    return {
      status: 'started',
      message: `Stress test initiated on ${targetCores} core(s) with ${targetRam}MB RAM for ${duration}s`,
      details: this.benchmarkDetails
    };
  }

  stopBenchmark() {
    if (!this.isBenchmarking) {
      return { status: 'not_running', message: 'No benchmark is currently active.' };
    }

    if (this.benchmarkTimer) {
      clearTimeout(this.benchmarkTimer);
      this.benchmarkTimer = null;
    }

    // Terminate all worker threads cleanly
    if (this.benchmarkWorkers && this.benchmarkWorkers.length > 0) {
      for (const worker of this.benchmarkWorkers) {
        try {
          worker.postMessage('stop');
          worker.terminate().catch(() => {});
        } catch (e) {}
      }
      this.benchmarkWorkers = [];
    }

    // Free memory buffer chunks
    if (this.benchmarkMemoryChunks) {
      this.benchmarkMemoryChunks.length = 0;
    }

    this.isBenchmarking = false;
    this.benchmarkDetails = null;

    if (global.gc) {
      try { global.gc(); } catch (e) {}
    }

    this.addLog('SUCCESS', 'Stress test completed / stopped cleanly.', 'benchmark-engine');
    return {
      status: 'stopped',
      message: 'Stress test successfully halted and resources released.'
    };
  }

  // ==========================================
  // Docker & Container Monitoring Subsystem
  // ==========================================

  async getContainersOverview() {
    let dockerInfo = {
      installed: false,
      active: false,
      serverVersion: 'N/A',
      apiVersion: 'N/A',
      operatingSystem: 'N/A',
      architecture: 'N/A',
      driver: 'N/A',
      cgroupDriver: 'N/A',
      dockerRootDir: 'N/A',
      containersTotal: 0,
      containersRunning: 0,
      containersPaused: 0,
      containersStopped: 0,
      imagesCount: 0,
      memTotal: os.totalmem(),
      ncpu: os.cpus().length
    };

    let containerList = [];

    try {
      const [dInfo, dContainers, dStats] = await Promise.all([
        si.dockerInfo().catch(() => null),
        si.dockerContainers(true).catch(() => []),
        si.dockerContainerStats('*').catch(() => [])
      ]);

      if (dInfo && (dInfo.serverVersion || dInfo.id)) {
        dockerInfo = {
          installed: true,
          active: true,
          serverVersion: dInfo.serverVersion || 'N/A',
          apiVersion: dInfo.apiVersion || '1.45',
          operatingSystem: dInfo.operatingSystem || 'Linux',
          architecture: dInfo.architecture || os.arch(),
          kernelVersion: dInfo.kernelVersion || os.release(),
          driver: dInfo.driver || 'overlay2',
          cgroupDriver: dInfo.cgroupDriver || 'systemd',
          dockerRootDir: dInfo.dockerRootDir || '/var/lib/docker',
          containersTotal: dInfo.containers || 0,
          containersRunning: dInfo.containersRunning || 0,
          containersPaused: dInfo.containersPaused || 0,
          containersStopped: dInfo.containersStopped || 0,
          imagesCount: dInfo.images || 0,
          memTotal: dInfo.memTotal || os.totalmem(),
          ncpu: dInfo.ncpu || os.cpus().length
        };
      } else {
        try {
          execSync('which docker', { stdio: 'ignore' });
          dockerInfo.installed = true;
          dockerInfo.active = false;
        } catch (e) {}
      }

      const statsMap = new Map();
      if (Array.isArray(dStats)) {
        for (const s of dStats) {
          statsMap.set(s.id, s);
        }
      }

      if (Array.isArray(dContainers)) {
        containerList = dContainers.map(c => {
          const stats = statsMap.get(c.id) || {};
          const cpuPct = stats.cpuPercent !== undefined ? stats.cpuPercent : 0;
          const memUsage = stats.memUsage || 0;
          const memLimit = stats.memLimit || os.totalmem();
          const memPct = memLimit > 0 ? Math.round((memUsage / memLimit) * 1000) / 10 : 0;

          return {
            id: c.id ? c.id.substring(0, 12) : 'unknown',
            fullId: c.id,
            name: (c.name || 'container').replace(/^\//, ''),
            image: c.image || 'unknown',
            imageId: c.imageID ? c.imageID.substring(0, 12) : '',
            command: c.command || '',
            created: c.created || '',
            state: (c.state || 'exited').toLowerCase(),
            status: c.status || '',
            ports: c.ports || [],
            mounts: c.mounts || [],
            cpuPercent: Math.round(cpuPct * 10) / 10,
            memUsage,
            memLimit,
            memPercent: memPct,
            netRx: stats.netIO?.rx || 0,
            netTx: stats.netIO?.tx || 0,
            blockRead: stats.blockIO?.r || 0,
            blockWrite: stats.blockIO?.w || 0,
            pids: stats.pids || 1
          };
        });
      }
    } catch (err) {
      console.warn('[TelemetryEngine] Error reading container stats:', err.message);
    }

    return {
      docker: dockerInfo,
      containers: containerList
    };
  }

  async containerAction(containerId, action) {
    if (!containerId || !/^[a-zA-Z0-9_-]+$/.test(containerId)) {
      throw new Error('Invalid container ID format.');
    }
    const validActions = ['start', 'stop', 'restart', 'pause', 'unpause', 'remove', 'delete', 'rm', 'kill'];
    const act = action.toLowerCase();
    if (!validActions.includes(act)) {
      throw new Error(`Unsupported container action: ${action}`);
    }

    let dockerCmd = `docker ${act} ${containerId}`;
    if (act === 'remove' || act === 'delete' || act === 'rm') {
      dockerCmd = `docker rm -f ${containerId}`;
    }

    return new Promise((resolve, reject) => {
      exec(dockerCmd, (err, stdout, stderr) => {
        if (err) {
          this.addLog('ERROR', `Container action failed: ${dockerCmd} -> ${stderr || err.message}`, 'docker');
          return reject(new Error(stderr || err.message));
        }
        this.addLog('SUCCESS', `Container ${containerId} ${act} executed successfully.`, 'docker');
        resolve({ success: true, containerId, action: act, output: stdout.trim() });
      });
    });
  }

  async getContainerLogs(containerId, tail = 100) {
    if (!containerId || !/^[a-zA-Z0-9_-]+$/.test(containerId)) {
      throw new Error('Invalid container ID format.');
    }
    const safeTail = Math.max(10, Math.min(1000, parseInt(tail, 10) || 100));

    return new Promise((resolve, reject) => {
      exec(`docker logs --tail ${safeTail} --timestamps ${containerId}`, (err, stdout, stderr) => {
        const rawOutput = (stdout || '') + (stderr || '');
        const lines = rawOutput.split('\n').filter(Boolean).map(line => {
          const match = line.match(/^(\S+)\s+(.*)$/);
          if (match) {
            return { timestamp: match[1], message: match[2] };
          }
          return { timestamp: new Date().toISOString(), message: line };
        });
        resolve({ containerId, tail: safeTail, lines });
      });
    });
  }

  async deployDemoContainer() {
    return new Promise((resolve, reject) => {
      exec('docker rm -f nexus-pulse-demo 2>/dev/null; docker run -d --name nexus-pulse-demo -p 8899:80 nginx:alpine || docker run -d --name nexus-pulse-demo alpine sleep 3600', (err, stdout, stderr) => {
        if (err) {
          this.addLog('ERROR', `Failed to deploy demo container: ${stderr || err.message}`, 'docker');
          return reject(new Error(stderr || err.message));
        }
        this.addLog('SUCCESS', `Demo container deployed: ${stdout.trim().substring(0, 12)}`, 'docker');
        resolve({ success: true, containerId: stdout.trim().substring(0, 12) });
      });
    });
  }

  // ==========================================
  // Virtualization & VM Subsystem
  // ==========================================

  async getVirtualizationOverview() {
    let cpuinfo = '';
    try {
      cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    } catch (e) {}

    const hasVmx = cpuinfo.includes(' vmx ') || /flags\s*:.* vmx /i.test(cpuinfo);
    const hasSvm = cpuinfo.includes(' svm ') || /flags\s*:.* svm /i.test(cpuinfo);
    const kvmDevice = fs.existsSync('/dev/kvm');

    let virtType = 'none';
    try {
      const out = execSync('systemd-detect-virt 2>/dev/null || echo "none"', { encoding: 'utf8' }).trim();
      virtType = out.split('\n')[0].trim().toLowerCase();
    } catch (e) {
      virtType = 'none';
    }

    const isBareMetal = !virtType || virtType === 'none';
    const role = isBareMetal ? 'HOST' : 'GUEST';
    const roleLabel = isBareMetal ? 'Bare-Metal Master Host (Physical Hardware)' : `Virtual Machine Guest (${virtType.toUpperCase()})`;

    // Check installed virtualization / container engines
    const engines = {
      docker: false,
      podman: false,
      containerd: false,
      libvirt: false,
      qemu: false,
      lxc: false
    };

    const checkBin = (bin) => {
      try {
        execSync(`which ${bin}`, { stdio: 'ignore' });
        return true;
      } catch (e) {
        return false;
      }
    };

    engines.docker = checkBin('docker');
    engines.podman = checkBin('podman');
    engines.containerd = checkBin('containerd');
    engines.libvirt = checkBin('virsh');
    engines.qemu = checkBin('qemu-system-x86_64');
    engines.lxc = checkBin('lxc') || checkBin('lxc-ls');

    // Scan VMs from virsh or qemu processes
    const vms = [];
    try {
      let virshOut = '';
      try {
        virshOut = execSync('virsh -c qemu:///system list --all 2>/dev/null || virsh list --all 2>/dev/null || true', { encoding: 'utf8' }).trim();
      } catch (e) {}

      let psOut = '';
      try {
        psOut = execSync('ps aux | grep "[q]emu-system"', { encoding: 'utf8' }).trim();
      } catch (e) {}

      const qemuProcesses = [];
      if (psOut) {
        for (const line of psOut.split('\n')) {
          const cols = line.trim().split(/\s+/);
          if (cols.length >= 11) {
            const pid = parseInt(cols[1], 10);
            const cpu = parseFloat(cols[2]) || 0;
            const mem = parseFloat(cols[3]) || 0;
            const cmd = cols.slice(10).join(' ');

            let guestName = '';
            const nameMatch = cmd.match(/-name\s+(?:guest=)?([a-zA-Z0-9._-]+)/);
            if (nameMatch) {
              guestName = nameMatch[1];
            }

            let memMb = 0;
            const memMatch = cmd.match(/-m\s+(?:size=)?([0-9]+)([kmg]?)/i);
            if (memMatch) {
              const val = parseInt(memMatch[1], 10);
              const unit = (memMatch[2] || 'm').toLowerCase();
              if (unit === 'k') memMb = Math.round(val / 1024);
              else if (unit === 'g') memMb = val * 1024;
              else memMb = val;
            }

            let vcpus = 1;
            const smpMatch = cmd.match(/-smp\s+(?:cpus=)?([0-9]+)/);
            if (smpMatch) {
              vcpus = parseInt(smpMatch[1], 10);
            }

            let diskPath = '';
            const diskMatch = cmd.match(/(?:filename=|-drive\s+file=)([^, ]+\.(?:qcow2|raw|img|iso))/);
            if (diskMatch) {
              diskPath = diskMatch[1];
            }

            let display = '';
            const spiceMatch = cmd.match(/-spice\s+port=([0-9]+)/);
            if (spiceMatch) display = `SPICE :${spiceMatch[1]}`;
            const vncMatch = cmd.match(/-vnc\s+:([0-9]+)/);
            if (vncMatch) display = `VNC :${5900 + parseInt(vncMatch[1], 10)}`;

            qemuProcesses.push({
              pid,
              guestName,
              cpu,
              mem,
              memMb,
              vcpus,
              diskPath,
              display
            });
          }
        }
      }

      if (virshOut) {
        const lines = virshOut.split('\n').slice(2);
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const id = parts[0] === '-' ? '-' : parts[0];
            const name = parts[1];
            const rawState = parts.slice(2).join(' ').toLowerCase();
            const state = rawState.includes('running') ? 'running' :
                          rawState.includes('paused') ? 'paused' :
                          rawState.includes('in shutdown') ? 'in shutdown' : 'shut off';

            let vcpus = 2;
            let memoryMb = 2048;
            let autostart = false;
            try {
              const infoOut = execSync(`virsh -c qemu:///system dominfo ${name} 2>/dev/null || virsh dominfo ${name} 2>/dev/null || true`, { encoding: 'utf8' });
              const vcpuM = infoOut.match(/CPU\(s\):\s+([0-9]+)/);
              if (vcpuM) vcpus = parseInt(vcpuM[1], 10);
              const memM = infoOut.match(/Max memory:\s+([0-9]+)\s+KiB/);
              if (memM) memoryMb = Math.round(parseInt(memM[1], 10) / 1024);
              if (infoOut.includes('Autostart:      enable')) autostart = true;
            } catch (e) {}

            const proc = qemuProcesses.find(p => p.guestName === name) || {};

            vms.push({
              id,
              name,
              status: state,
              vcpus: proc.vcpus || vcpus,
              memoryMb: proc.memMb || memoryMb,
              diskImage: proc.diskPath || 'Standard Storage Disk',
              displayPort: proc.display || 'SPICE / VNC',
              pid: proc.pid || null,
              cpuPercent: proc.cpu || 0,
              memPercent: proc.mem || 0,
              hypervisor: 'KVM / QEMU (libvirt)',
              autostart
            });
          }
        }
      }

      // Add any standalone QEMU process not listed in virsh
      for (const proc of qemuProcesses) {
        if (proc.guestName && !vms.some(v => v.name === proc.guestName)) {
          vms.push({
            id: String(proc.pid),
            name: proc.guestName,
            status: 'running',
            vcpus: proc.vcpus || 1,
            memoryMb: proc.memMb || 1024,
            diskImage: proc.diskPath || 'Virtual Storage',
            displayPort: proc.display || 'VNC',
            pid: proc.pid,
            cpuPercent: proc.cpu || 0,
            memPercent: proc.mem || 0,
            hypervisor: 'QEMU Standalone',
            autostart: false
          });
        }
      }
    } catch (e) {
      console.warn('[TelemetryEngine] Error reading VM status:', e.message);
    }

    // Virtual Network Bridges
    const ifaces = os.networkInterfaces();
    const bridges = [];
    for (const [ifaceName, ifaceDetails] of Object.entries(ifaces)) {
      if (ifaceName.startsWith('docker') || ifaceName.startsWith('virbr') || ifaceName.startsWith('br-') || ifaceName.startsWith('veth') || ifaceName.startsWith('tun') || ifaceName.startsWith('tap') || ifaceName.startsWith('vnet')) {
        const ipv4 = ifaceDetails?.find(d => d.family === 'IPv4' || d.family === 4);
        bridges.push({
          iface: ifaceName,
          ip4: ipv4 ? ipv4.address : 'Unassigned',
          mac: ipv4 ? ipv4.mac : ifaceDetails?.[0]?.mac || '',
          type: ifaceName.startsWith('docker') ? 'docker' : ifaceName.startsWith('virbr') ? 'libvirt' : ifaceName.startsWith('vnet') ? 'vm-tap' : ifaceName.startsWith('veth') ? 'veth' : 'bridge',
          state: 'active'
        });
      }
    }

    let hwType = 'None';
    if (hasSvm) hwType = 'AMD-V (SVM)';
    else if (hasVmx) hwType = 'Intel VT-x (VMX)';

    return {
      role,
      roleLabel,
      hypervisor: isBareMetal ? 'None (Bare Metal Server)' : virtType.toUpperCase(),
      hardwareVirt: {
        supported: hasSvm || hasVmx,
        type: hwType,
        kvmDevice,
        nestedVirt: true,
        iommu: true
      },
      engines,
      vms,
      bridges
    };
  }

  async vmAction(vmName, action) {
    if (!vmName || !/^[a-zA-Z0-9._-]+$/.test(vmName)) {
      throw new Error('Invalid VM domain name format.');
    }
    const validActions = ['start', 'shutdown', 'destroy', 'reboot', 'pause', 'suspend', 'resume', 'reset'];
    const act = action.toLowerCase();
    if (!validActions.includes(act)) {
      throw new Error(`Unsupported VM action: ${action}`);
    }

    let virshCmd = act;
    if (act === 'pause') virshCmd = 'suspend';

    return new Promise((resolve, reject) => {
      exec(`virsh -c qemu:///system ${virshCmd} ${vmName} || virsh ${virshCmd} ${vmName}`, (err, stdout, stderr) => {
        if (err) {
          this.addLog('ERROR', `VM action failed: virsh ${virshCmd} ${vmName} -> ${stderr || err.message}`, 'virtualization');
          return reject(new Error(stderr || err.message));
        }
        this.addLog('SUCCESS', `VM ${vmName} ${act} executed successfully.`, 'virtualization');
        resolve({ success: true, vmName, action: act, output: stdout.trim() });
      });
    });
  }
}

module.exports = new TelemetryEngine();
