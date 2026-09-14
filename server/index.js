/**
 * NexusPulse Master 2-Tier Supervisor & Launcher
 *
 * Architecture:
 * - Tier 1: Front-Facing Security Proxy Gateway (server/proxy.js)
 *   • Interface: 0.0.0.0:4500 (Public Access)
 *   • Duties: Dynamic CORS Guard (LAN/Tailscale/Loopback), Rate Limiter,
 *             Embedded Vector DB Authentication Guard, CSWSH Protection,
 *             High-Speed HTTP & WebSocket Reverse Proxy.
 *
 * - Tier 2: Internal Telemetry & Operations Engine (server/backend.js)
 *   • Interface: 127.0.0.1:4501 (Strict Loopback Isolation - No External Access)
 *   • Duties: Express REST API, 1Hz WebSocket Real-Time Broadcast, Hardware Sensors,
 *             Docker & Libvirt Hypervisor APIs, Download Manager, System Specs.
 *
 * Supervisor Duties:
 * - Spawns Tier 2 Backend as an isolated OS child process.
 * - Monitors Tier 2 and automatically restarts it upon unexpected crash.
 * - Starts Tier 1 Proxy once Tier 2 is ready and verified.
 * - Handles graceful termination (SIGINT/SIGTERM) across all tiers.
 */

const path = require('path');
const { fork } = require('child_process');
const { proxyServer, startProxyServer, closeProxyServer, setInternalPort } = require('./proxy');
const telemetry = require('./telemetry');
const backend = require('./backend');

const DEFAULT_PUBLIC_PORT = parseInt(process.env.PORT, 10) || 4500;
const DEFAULT_INTERNAL_PORT = parseInt(process.env.INTERNAL_PORT, 10) || 4501;

let isShuttingDown = false;
let backendChild = null;

/**
 * Spawns the Tier 2 Backend Engine in a physically isolated child process.
 */
function spawnBackendProcess(internalPort = DEFAULT_INTERNAL_PORT) {
  return new Promise((resolve, reject) => {
    const backendScript = path.join(__dirname, 'backend.js');
    const child = fork(backendScript, [], {
      env: {
        ...process.env,
        INTERNAL_PORT: String(internalPort)
      },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    });

    let resolved = false;

    child.on('message', (msg) => {
      if (msg && msg.type === 'ready') {
        if (!resolved) {
          resolved = true;
          resolve(child);
        }
      }
    });

    child.on('error', (err) => {
      console.error('[2-Tier Supervisor] Failed to fork Tier 2 Backend:', err);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    child.on('exit', (code, signal) => {
      console.warn(`[2-Tier Supervisor] Tier 2 Backend process exited (PID: ${child.pid}, Code: ${code}, Signal: ${signal})`);
      if (!isShuttingDown) {
        console.log('[2-Tier Supervisor] Auto-restarting Tier 2 Backend in 1 second...');
        setTimeout(() => {
          spawnBackendProcess(internalPort).then((newChild) => {
            backendChild = newChild;
          }).catch((err) => {
            console.error('[2-Tier Supervisor] Restart attempt failed:', err.message);
          });
        }, 1000);
      }
    });

    // Safety timeout in case IPC message is missed but port is open
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(child);
      }
    }, 2500);
  });
}

/**
 * Starts the complete 2-Tier Stack
 */
async function start2TierServer({ publicPort = DEFAULT_PUBLIC_PORT, internalPort = DEFAULT_INTERNAL_PORT } = {}) {
  console.log('============================================================');
  console.log('  🛡️ NexusPulse Initializing 2-Tier Isolated Architecture 🛡️');
  console.log('============================================================');
  console.log(`  • Tier 1 Proxy Port:    ${publicPort} (Public 0.0.0.0)`);
  console.log(`  • Tier 2 Backend Port:  ${internalPort} (Isolated 127.0.0.1)`);
  console.log('============================================================\n');

  // 1. Launch Tier 2 Backend Engine Child Process
  backendChild = await spawnBackendProcess(internalPort);

  // 2. Launch Tier 1 Security Proxy Gateway
  await startProxyServer(publicPort, internalPort);

  return {
    proxyServer,
    backendChild,
    close: async () => {
      isShuttingDown = true;
      await closeProxyServer();
      if (backendChild && !backendChild.killed) {
        backendChild.kill('SIGTERM');
      }
    }
  };
}

/**
 * Graceful termination handler
 */
function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[2-Tier Supervisor] Received ${signal}. Gracefully shutting down 2-Tier Stack...`);

  closeProxyServer().catch(() => {});

  if (backendChild && !backendChild.killed) {
    try {
      backendChild.kill('SIGTERM');
    } catch (e) {}
  }

  setTimeout(() => {
    console.log('[2-Tier Supervisor] Clean shutdown complete.');
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

/**
 * Compatibility wrapper for test runners
 */
async function startServer(publicPort = DEFAULT_PUBLIC_PORT, internalPort = null) {
  const iPort = internalPort || (publicPort === 4500 ? DEFAULT_INTERNAL_PORT : publicPort + 10);
  const result = await start2TierServer({ publicPort, internalPort: iPort });
  return result.proxyServer;
}

// Augmented server object for test suites calling server.close()
const supervisorServer = proxyServer;
const originalClose = supervisorServer.close.bind(supervisorServer);
supervisorServer.close = function (cb) {
  isShuttingDown = true;
  if (backendChild && !backendChild.killed) {
    try {
      backendChild.kill('SIGTERM');
    } catch (e) {}
  }
  return originalClose(cb);
};

if (require.main === module) {
  start2TierServer({
    publicPort: DEFAULT_PUBLIC_PORT,
    internalPort: DEFAULT_INTERNAL_PORT
  }).catch((err) => {
    console.error('[2-Tier Supervisor Fatal Error]:', err);
    process.exit(1);
  });
}

module.exports = {
  start2TierServer,
  startServer,
  proxyServer,
  server: supervisorServer,
  app: backend.app,
  telemetry,
  getBackendProcess: () => backendChild
};
