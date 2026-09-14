import { SystemMetrics, SystemOverview, HistoryPoint, AlertItem, AlertRules, LogEntry, ProcessResponse, OpenPort } from '../types/telemetry';
import { authService } from './auth';

type MessageHandler = (type: string, data: any) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: any = null;
  public isConnected: boolean = false;
  private pollIntervalMs: number = 1000;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.baseUrl = `${protocol}//${host}/ws`;

    // Automatically send auth message if token changes while connected
    authService.subscribe((token) => {
      if (!token && this.ws) this.ws.close();
      if (token && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.authenticate(token);
      }
    });
  }

  private getUrlWithToken(): string {
    const token = authService.getToken();
    if (token) {
      return `${this.baseUrl}?token=${encodeURIComponent(token)}`;
    }
    return this.baseUrl;
  }

  connect() {
    if (!authService.isAuthenticated()) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.getUrlWithToken());

      this.ws.onopen = () => {
        this.isConnected = true;
        this.notify('status', { connected: true });
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        const token = authService.getToken();
        if (token) {
          this.authenticate(token);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.notify(msg.type, msg);
        } catch (e) {
          console.error('WS Parse Error:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.notify('status', { connected: false });
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('WS error occurred:', err);
        if (this.ws) this.ws.close();
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 2000);
    }
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private notify(type: string, data: any) {
    this.handlers.forEach((handler) => {
      try {
        handler(type, data);
      } catch (e) {
        console.error('Handler error:', e);
      }
    });
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  setInterval(intervalMs: number) {
    this.pollIntervalMs = intervalMs;
    this.send({ action: 'set_interval', intervalMs });
  }

  requestProcesses(sort: 'cpu' | 'mem' = 'cpu', limit: number = 50, search: string = '') {
    this.send({ action: 'request_processes', sort, limit, search });
  }

  killProcess(pid: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') {
    this.send({ action: 'kill_process', pid, signal });
  }

  startBenchmark(durationSec: number = 10, cpuCores?: number, ramMb: number = 256) {
    this.send({ action: 'start_benchmark', durationSec, cpuCores, ramMb });
  }

  stopBenchmark() {
    this.send({ action: 'stop_benchmark' });
  }

  requestPorts() {
    this.send({ action: 'request_ports' });
  }

  requestContainers() {
    this.send({ action: 'request_containers' });
  }

  requestVirtualization() {
    this.send({ action: 'request_virtualization' });
  }

  containerAction(id: string, action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause') {
    this.send({ action: 'container_action', payload: { id, action } });
  }

  deployDemoContainer() {
    this.send({ action: 'deploy_demo_container' });
  }

  authenticate(token: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'auth', token });
    }
  }

  reconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.connect();
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.notify('status', { connected: false });
  }
}

export const wsClient = new WebSocketClient();
