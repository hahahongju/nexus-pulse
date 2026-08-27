/**
 * NexusPulse Server Entrypoint
 * Express REST API & WebSocket Real-Time Telemetry Streaming Engine
 * 
 * Features:
 * - High-speed WebSocket server broadcasting 1Hz telemetry ticks and alerts
 * - Full REST API for system overview, metrics, history, processes, ports, logs, alerts, benchmark
 * - Static SPA file serving for client application
 * - Graceful shutdown and resilient error handling
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const telemetry = require('./telemetry');

const app = express();
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 4500;

// ==========================================
// Middleware Configuration
// ==========================================

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Request logging for API calls (excluding high-frequency health checks)
app.use((req, res, next) => {
  if (req.path.startsWith('/api') && req.path !== '/api/health') {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (res.statusCode >= 400) {
        console.warn(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
      }
    });
  }
  next();
});

// ==========================================
// REST API Routes
// ==========================================

const apiRouter = express.Router();

/**
 * GET /api/health
 * Server health check and uptime
 */
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NexusPulse Telemetry Server',
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    systemUptime: Math.round(os.uptime()),
    timestamp: Date.now()
  });
});

/**
 * GET /api/system/overview
 * Static system specifications, hardware specs, OS & memory layout
 */
apiRouter.get('/system/overview', async (req, res) => {
  try {
    const overview = await telemetry.getStaticSpecs();
    res.json({
      status: 'ok',
      data: overview
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/system/metrics
 * Instantaneous real-time metric snapshot
 */
apiRouter.get('/system/metrics', async (req, res) => {
  try {
    const metrics = await telemetry.getMetrics();
    res.json({
      status: 'ok',
      data: metrics
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/system/history
 * Past 60 seconds rolling telemetry data points
 */
apiRouter.get('/system/history', (req, res) => {
  try {
    const history = telemetry.getHistory();
    res.json({
      status: 'ok',
      count: history.length,
      data: history
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/system/processes
 * Process list with sorting, filtering, and pagination
 * Query params: ?sort=cpu|mem|pid|name & limit=50 & search=...
 */
apiRouter.get('/system/processes', async (req, res) => {
  try {
    const { sort = 'cpu', limit = 50, search = '' } = req.query;
    const procData = await telemetry.getProcesses({ sort, limit, search });
    res.json({
      status: 'ok',
      data: procData
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/system/processes/kill
 * Terminate a process by PID with a signal (SIGTERM, SIGKILL, etc.)
 */
apiRouter.post('/system/processes/kill', async (req, res) => {
  try {
    const { pid, signal = 'SIGTERM' } = req.body;
    if (!pid) {
      return res.status(400).json({ status: 'error', message: 'Missing required field: pid' });
    }

    const result = await telemetry.killProcess(pid, signal);
    res.json({
      status: 'ok',
      data: result
    });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/system/ports
 * Open listening network ports
 */
apiRouter.get('/system/ports', async (req, res) => {
  try {
    const ports = await telemetry.getOpenPorts();
    res.json({
      status: 'ok',
      count: ports.length,
      data: ports
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/benchmark/start
 * Launch a safe CPU/RAM stress benchmark
 */
apiRouter.post('/benchmark/start', (req, res) => {
  try {
    const { durationSec = 10, cpuCores, ramMb = 256 } = req.body || {};
    const result = telemetry.startBenchmark({ durationSec, cpuCores, ramMb });
    res.json({
      status: 'ok',
      data: result
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/benchmark/stop
 * Halt any active stress benchmark immediately
 */
apiRouter.post('/benchmark/stop', (req, res) => {
  try {
    const result = telemetry.stopBenchmark();
    res.json({
      status: 'ok',
      data: result
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/alerts
 * Active alerts, rule configuration, and alert history
 */
apiRouter.get('/alerts', (req, res) => {
  try {
    const alerts = telemetry.getAlerts();
    res.json({
      status: 'ok',
      data: alerts
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/alerts/config
 * Update alert threshold configuration
 */
apiRouter.post('/alerts/config', (req, res) => {
  try {
    const updated = telemetry.updateAlertRules(req.body);
    res.json({
      status: 'ok',
      data: updated
    });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/logs
 * Buffered system and server event logs
 */
apiRouter.get('/logs', (req, res) => {
  try {
    const { limit = 100, level, search } = req.query;
    const logs = telemetry.getLogs({
      limit: parseInt(limit, 10) || 100,
      level,
      search
    });
    res.json({
      status: 'ok',
      count: logs.length,
      data: logs
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/containers
 * Docker engine specs and active/all container metrics
 */
apiRouter.get('/containers', async (req, res) => {
  try {
    const data = await telemetry.getContainersOverview();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/containers/demo/deploy
 * Deploy sample testing container
 */
apiRouter.post('/containers/demo/deploy', async (req, res) => {
  try {
    const result = await telemetry.deployDemoContainer();
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/containers/:id/:action
 * Execute lifecycle action on container (start, stop, restart, pause, unpause, remove)
 */
apiRouter.post('/containers/:id/:action', async (req, res) => {
  try {
    const { id, action } = req.params;
    const result = await telemetry.containerAction(id, action);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * DELETE /api/containers/:id
 * Remove / Delete container (docker rm -f)
 */
apiRouter.delete('/containers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await telemetry.containerAction(id, 'remove');
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/containers/:id/logs
 * Retrieve latest container logs
 */
apiRouter.get('/containers/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { tail = 100 } = req.query;
    const result = await telemetry.getContainerLogs(id, tail);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/virtualization
 * Hypervisor type, bare-metal vs guest mode, hardware VT-x/AMD-V flags, and active VMs
 */
apiRouter.get('/virtualization', async (req, res) => {
  try {
    const data = await telemetry.getVirtualizationOverview();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/vms/:name/:action
 * Control Virtual Machine domain (start, shutdown, destroy, reboot, pause, resume, reset)
 */
apiRouter.post('/vms/:name/:action', async (req, res) => {
  try {
    const { name, action } = req.params;
    const result = await telemetry.vmAction(name, action);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

// Mount API router
app.use('/api', apiRouter);

// Support /api/v1 prefix as alias for PRD compatibility
app.use('/api/v1', apiRouter);

// ==========================================
// Static File Serving & SPA Fallback
// ==========================================

const clientDistPath = path.resolve(__dirname, '../client/dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  // SPA fallback for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // If client isn't built yet, provide informative landing response
  app.get('/', (req, res) => {
    res.json({
      name: 'NexusPulse Core Telemetry Server',
      status: 'running',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        overview: '/api/system/overview',
        metrics: '/api/system/metrics',
        history: '/api/system/history',
        processes: '/api/system/processes',
        ports: '/api/system/ports',
        alerts: '/api/alerts',
        logs: '/api/logs',
        benchmarkStart: 'POST /api/benchmark/start',
        benchmarkStop: 'POST /api/benchmark/stop',
        websocket: 'ws://' + (req.headers.host || `localhost:${DEFAULT_PORT}`) + '/ws'
      }
    });
  });
}

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  });
});

// ==========================================
// HTTP & WebSocket Server Setup
// ==========================================

const server = http.createServer(app);

const wss = new WebSocketServer({
  noServer: true
});

const clients = new Set();

// Heartbeat tracking to detect and prune dead sockets
function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws, request) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  clients.add(ws);

  const clientIp = request.socket.remoteAddress;
  telemetry.addLog('INFO', `WebSocket client connected from ${clientIp} (Active clients: ${clients.size})`, 'websocket');

  // Send initial welcome & full state message immediately
  (async () => {
    try {
      const [overview, metrics, containers, virt] = await Promise.all([
        telemetry.getStaticSpecs(),
        telemetry.getMetrics(),
        telemetry.getContainersOverview(),
        telemetry.getVirtualizationOverview()
      ]);
      const history = telemetry.getHistory();
      const alerts = telemetry.getAlerts();
      const logs = telemetry.getLogs({ limit: 100 });

      ws.send(JSON.stringify({
        type: 'init',
        overview,
        metrics,
        data: metrics,
        history,
        alerts: alerts.active || [],
        rules: alerts.rules || {},
        logs: logs.logs || [],
        containers,
        virtualization: virt,
        timestamp: Date.now(),
        clientsCount: clients.size
      }));
    } catch (e) {
      console.warn('Error sending initial WS snapshot:', e.message);
    }
  })();

  // Handle client incoming messages & commands
  ws.on('message', async (rawMessage) => {
    try {
      const msg = JSON.parse(rawMessage.toString());
      const cmdType = msg.type || msg.command || msg.action;

      switch (cmdType) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'request_containers': {
          const containers = await telemetry.getContainersOverview();
          ws.send(JSON.stringify({
            type: 'containers',
            timestamp: Date.now(),
            data: containers
          }));
          break;
        }

        case 'request_virtualization': {
          const virt = await telemetry.getVirtualizationOverview();
          ws.send(JSON.stringify({
            type: 'virtualization',
            timestamp: Date.now(),
            data: virt
          }));
          break;
        }

        case 'container_action': {
          try {
            const { id, action } = msg.payload || msg;
            const res = await telemetry.containerAction(id, action);
            ws.send(JSON.stringify({
              type: 'container_action_result',
              success: true,
              data: res
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'container_action_result',
              success: false,
              error: err.message
            }));
          }
          break;
        }

        case 'deploy_demo_container': {
          try {
            const res = await telemetry.deployDemoContainer();
            ws.send(JSON.stringify({
              type: 'deploy_demo_result',
              success: true,
              data: res
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'deploy_demo_result',
              success: false,
              error: err.message
            }));
          }
          break;
        }

        case 'vm_action': {
          try {
            const { name, action } = msg.payload || msg;
            const res = await telemetry.vmAction(name, action);
            ws.send(JSON.stringify({
              type: 'vm_action_result',
              success: true,
              data: res
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'vm_action_result',
              success: false,
              error: err.message
            }));
          }
          break;
        }

        case 'request_history':
          ws.send(JSON.stringify({
            type: 'history',
            timestamp: Date.now(),
            data: telemetry.getHistory()
          }));
          break;

        case 'request_processes': {
          const procs = await telemetry.getProcesses(msg.payload || msg);
          ws.send(JSON.stringify({
            type: 'processes',
            timestamp: Date.now(),
            data: procs
          }));
          break;
        }

        case 'kill_process': {
          try {
            const { pid, signal } = msg.payload || msg;
            const res = await telemetry.killProcess(pid, signal);
            ws.send(JSON.stringify({
              type: 'process_killed',
              success: true,
              data: res
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'process_killed',
              success: false,
              error: err.message
            }));
          }
          break;
        }

        case 'start_benchmark': {
          const res = telemetry.startBenchmark(msg.payload || msg);
          ws.send(JSON.stringify({
            type: 'benchmark_status',
            data: res
          }));
          break;
        }

        case 'stop_benchmark': {
          const res = telemetry.stopBenchmark();
          ws.send(JSON.stringify({
            type: 'benchmark_status',
            data: res
          }));
          break;
        }

        case 'request_logs': {
          const logs = telemetry.getLogs(msg.payload || msg);
          ws.send(JSON.stringify({
            type: 'logs',
            timestamp: Date.now(),
            data: logs
          }));
          break;
        }

        case 'request_ports': {
          const ports = await telemetry.getOpenPorts();
          ws.send(JSON.stringify({
            type: 'ports',
            timestamp: Date.now(),
            data: ports
          }));
          break;
        }

        case 'request_overview': {
          const overview = await telemetry.getStaticSpecs();
          ws.send(JSON.stringify({
            type: 'overview',
            timestamp: Date.now(),
            data: overview
          }));
          break;
        }

        case 'set_interval':
          // Acknowledge custom interval preference
          ws.send(JSON.stringify({
            type: 'interval_set',
            intervalMs: msg.intervalMs || 1000
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'unknown_command',
            received: cmdType
          }));
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format. JSON expected.'
      }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    telemetry.addLog('INFO', `WebSocket client disconnected (Active clients: ${clients.size})`, 'websocket');
  });

  ws.on('error', (err) => {
    console.warn('[WebSocket Error]:', err.message);
    clients.delete(ws);
  });
});

// Upgrade handler supporting /ws and root /
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws' || pathname === '/ws/telemetry' || pathname === '/') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Periodic ping interval to prune dead connections
const pingInterval = setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) {
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// ==========================================
// Telemetry Live Broadcast Loop (1 Hz)
// ==========================================

let isBroadcasting = false;

const broadcastTicker = setInterval(async () => {
  if (isBroadcasting) return; // avoid overlapping ticks
  isBroadcasting = true;

  try {
    const snapshot = await telemetry.getMetrics();
    const alertsData = telemetry.getAlerts();

    if (clients.size > 0) {
      const payload = JSON.stringify({
        type: 'tick',
        timestamp: snapshot.timestamp,
        metrics: snapshot,
        alerts: alertsData.active,
        alertCount: alertsData.summary.total,
        benchmarkActive: snapshot.benchmarkActive,
        clientsCount: clients.size
      });

      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(payload);
          } catch (e) {
            console.warn('[Broadcast Error to client]:', e.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Broadcast Ticker Error]:', err.message);
  } finally {
    isBroadcasting = false;
  }
}, 1000);

// ==========================================
// Graceful Shutdown Management
// ==========================================

function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
  telemetry.addLog('WARN', `Server shutting down via ${signal}...`, 'lifecycle');

  clearInterval(broadcastTicker);
  clearInterval(pingInterval);

  telemetry.stopBenchmark();

  // Close all WebSocket clients
  for (const client of clients) {
    try {
      client.close(1001, 'Server shutting down');
    } catch (e) {}
  }
  clients.clear();

  // Close HTTP server
  server.close(() => {
    console.log('[Server] HTTP and WebSocket servers successfully closed.');
    process.exit(0);
  });

  // Force close after 5 seconds
  setTimeout(() => {
    console.error('[Server] Forcefully terminating after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('[FATAL uncaughtException]:', err);
  telemetry.addLog('ERROR', `Uncaught Exception: ${err.message}`, 'lifecycle');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]:', reason);
});

// ==========================================
// Start Listening (if run directly)
// ==========================================

function startServer(port = DEFAULT_PORT) {
  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`
============================================================
  ⚡ NexusPulse Telemetry & Operations Server Started ⚡
============================================================
  • Port:            ${port}
  • REST API Base:   http://localhost:${port}/api
  • WebSocket URL:   ws://localhost:${port}/ws
  • Node Version:    ${process.version}
  • Host Platform:   ${os.platform()} (${os.arch()})
  • PID:             ${process.pid}
============================================================
      `);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer(DEFAULT_PORT);
}

module.exports = { app, server, telemetry, startServer };
