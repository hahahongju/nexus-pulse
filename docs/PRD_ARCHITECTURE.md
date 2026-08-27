# NexusPulse (넥서스펄스) - Next-Gen Server Monitoring & Telemetry Dashboard
## Product Requirement Document (PRD) & Technical Architecture Specification

**Document Version:** 1.0.0  
**Status:** Approved & Ready for Implementation  
**Target Release:** v1.0.0 (MVP) ~ v1.2.0 (Production Enterprise)  
**Author:** Senior Project Manager & Technical Product Owner  
**Date:** 2026-08-27  

---

## 1. Executive Summary & Vision (개요 및 제품 비전)

### 1.1 Product Overview
**NexusPulse (넥서스펄스)**는 단일 서버부터 대규모 분산 클라우드/온프레미스 인프라까지 실시간으로 관제, 분석, 제어할 수 있는 **차세대 실시간 서버 모니터링 & 원격 오퍼레이션 대시보드(Next-Gen Telemetry & Operations Platform)**입니다.

기존 모니터링 도구(Prometheus/Grafana, Datadog 등)의 높은 학습 곡선 및 무거운 리소스 오버헤드를 극복하고, **초경량 에이전트(Ultra-light Agent) + 초저지연 WebSocket 실시간 스트리밍(Sub-100ms) + 웹 기반 원격 제어/터미널 통합**을 통해 개발자 및 SRE/DevOps 엔지니어에게 극대화된 직관성과 운영 생산성을 제공합니다.

```
       +-----------------------------------------------------------+
       |                  NexusPulse Web Client                    |
       |  (React 19 + TypeScript + TailwindCSS + Canvas/uPlot)     |
       +-----------------------------+-----------------------------+
                                     | WebSocket (Live Streaming)
                                     | HTTP/REST (Control & Queries)
       +-----------------------------v-----------------------------+
       |                  NexusPulse Core Server                   |
       |  (Node.js/Fastify + TypeScript + WS Engine + SQLite/TSDB) |
       +-----------------------------+-----------------------------+
                                     | gRPC / WS Push / HTTP
            +------------------------+------------------------+
            |                                                 |
+-----------v-----------+                         +-----------v-----------+
|  NexusPulse Agent #1  |                         |  NexusPulse Agent #N  |
| (Host / Linux Node)   |                         | (Docker / K8s Node)   |
+-----------------------+                         +-----------------------+
```

### 1.2 Core Value Propositions (핵심 가치)
1. **Zero-Lag Telemetry**: WebSocket 기반 초당 1~5회 실시간 메트릭 스트리밍 및 Canvas/WebGL 기반 고속 렌더링.
2. **All-in-One Operations**: 메트릭 관제뿐만 아니라 실시간 프로세스 kill/restart, systemd 서비스 제어, 웹 SSH 터미널 통합.
3. **Smart AI-Ready Alerting**: 임계치 기반 알람 및 지능형 이상 징후(Anomaly) 탐지, Discord/Slack/Webhook 자동 연동 및 복구 스크립트 실행.
4. **Lightweight & Self-Contained**: Go/Rust 또는 경량 Node 기반 단일 바이너리/컨테이너 배포 지원, CPU 사용률 <1%, 메모리 점유 <30MB.
5. **Modern Cyberpunk/Glassmorphic UI**: SRE 환경에 최적화된 다크 모드, 고대비 가시성, 커스텀 위젯 레이아웃.

---

## 2. Target User Personas & Use Cases

| 페르소나 | 주요 업무 및 니즈 | NexusPulse 해결 방안 |
| :--- | :--- | :--- |
| **DevOps / SRE Engineer** | 분산 서버의 리소스 병목, 장애 징후 실시간 감지 및 인시던트 대응 | 실시간 메트릭 스트리밍, 복합 알람 규칙, 원격 터미널 긴급 제어 |
| **Backend Developer** | 배포 후 API 서버의 CPU/메모리 누수, 무한 루프, 스레드 병목 파악 | 초단위 실시간 프로세스 트리, 로그 실시간 tailing, 리소스 스파이크 추적 |
| **System Administrator** | 다중 노드(Host/VM) 헬스체크, 디스크 용량 고갈 방지, 데몬 상태 관리 | 클러스터 그리드 뷰, 디스크 I/O 분석, systemd/Docker 서비스 제어 |
| **Tech Lead / CTO** | 인프라 가용성(SLA/SLO), 비용 최적화, 보안 감사 로그 확인 | 기간별 리소스 트렌드 리포트, RBAC 권한 분리, 감사 로그 보관 |

---

## 3. System Architecture & Tech Stack

### 3.1 Tech Stack Matrix

```mermaid
graph TD
    subgraph Frontend ["Frontend (Client Application)"]
        UI["React 19 + TypeScript + Vite"]
        ST["Zustand (Global/Realtime State)"]
        RT["TanStack React Query v5 (REST Caching)"]
        CH["uPlot / Canvas / Recharts (Charts)"]
        TR["xterm.js + WebGL Addon (Web Terminal)"]
        CSS["Tailwind CSS + Lucide Icons + Radix UI"]
    end

    subgraph Backend ["Backend (NexusPulse Core Server)"]
        SRV["Node.js + Fastify / TypeScript"]
        WSS["Fastify-Websocket / ws Server Engine"]
        SEC["JWT + bcrypt + Rate Limiter + Helmet"]
        ALM["Alert Evaluation & Dispatch Engine"]
        SSH["SSH2 Client / PTY Bridge"]
    end

    subgraph Storage ["Storage Layer"]
        DB["SQLite3 (WAL Mode) / DuckDB (Telemetry TSDB)"]
        CACHE["In-Memory Ring Buffer (Live 1hr Cache)"]
    end

    subgraph Agent ["NexusPulse Collector Agent"]
        COL["Host System Metric Collector (CPU, RAM, Disk, Net, GPU, Process)"]
        DOCK["Docker Socket & Systemd API Inspector"]
    end

    Agent -->|WebSocket Metric Push (JSON/Binary)| Backend
    Backend --> Storage
    Frontend <-->|WebSocket Metrics/Logs/PTY| Backend
    Frontend <-->|REST API (CRUD/Historical Data)| Backend
```

| 레이어 | 기술 스택 | 선정 사유 |
| :--- | :--- | :--- |
| **Frontend UI** | **React 19, TypeScript, Vite, TailwindCSS** | 컴포넌트 모듈성, 컴파일 속도, 모던 디자인 토큰 지원 |
| **State & Data Sync**| **Zustand, TanStack Query v5** | 초당 수십 회 유입되는 WebSocket 프레임 렌더링 최적화, REST 캐싱 |
| **Charts & Visuals** | **uPlot + HTML5 Canvas + Recharts** | 대용량 시계열 데이터(10,000+ points) 60fps 무지연 렌더링 |
| **Web Terminal** | **xterm.js + xterm-addon-fit + xterm-addon-webgl** | 고속 렌더링 웹 기반 SSH/TTY 세션 지원 |
| **Backend Core** | **Node.js (LTS), Fastify, TypeScript** | Express 대비 2~3배 처리량, 네이티브 비동기 I/O, WS 통합성 |
| **WebSocket Engine** | **Fastify-WebSocket / ws** | 서버-클라이언트 및 에이전트 간 초저지연 양방향 메시징 |
| **Database & Cache** | **SQLite (WAL 모드) + Ring Buffer** | 외부 DB 의존성 없는 독립형 경량 설치 지원, 초당 수천 write 처리 |
| **System Collector** | **systeminformation / psutil / Node OS** | 크로스 플랫폼(Linux, macOS, Windows) 시스템 메트릭 추출 |

---

## 4. Feature Specifications (기능 상세 명세)

### Module 1: Real-Time Cluster & Node Overview (클러스터 및 노드 오버뷰)
* **1.1 Multi-Node Grid Matrix**:
  * 등록된 모든 서버 노드의 실시간 상태(Healthy, Warning, Critical, Offline)를 카드/그리드 형태로 한눈에 표시.
  * 요약 메트릭(평균 CPU, 메모리 사용률, 디스크 사용량, 활성 알람 수) 배지 표시.
* **1.2 Real-Time Metric Streaming (1s/2s/5s 주기)**:
  * **CPU**: 코어별 사용률(User, System, Steal, IOWait), 로드 애버리지 (1m, 5m, 15m), CPU 온도/클럭 속도.
  * **Memory**: Total, Used, Free, Cached, Buffers, Swap 사용량 및 스왑 인/아웃 속도.
  * **Disk & Storage**: 파티션별 사용률(Mount point, Size, Free, Used %), 디스크 I/O (Read/Write IOPS, Throughput MB/s, Latency).
  * **Network**: 인터페이스별(eth0, wlan0, docker0 등) 수신/송신 대역폭(KB/s, MB/s), 패킷 드롭/에러율, Active TCP/UDP Connections.
  * **GPU (옵션)**: NVIDIA GPU 사용률, VRAM 점유율, 온도, 전력 소비량(Watts).

### Module 2: Interactive Real-Time Charts & Heatmaps
* **2.1 Live Time-Series Sparklines & Detail Charts**:
  * 최근 1분(1초 단위), 15분(5초 단위), 1시간, 24시간, 7일 시계열 줌/팬 인터랙션 지원.
* **2.2 Core Heatmap Matrix**:
  * 다중 코어(최대 128 Core+) CPU 부하 상태를 히트맵 그리드로 시각화.
* **2.3 Network Traffic Waterfall**:
  * Inbound / Outbound 실시간 스트림 파형 및 피크치 감지.

### Module 3: Live Process & Service Manager (프로세스 및 서비스 관리)
* **3.1 Live Top Processes**:
  * CPU, Memory, Disk Read/Write, PID, User, Command 기준으로 실시간 정렬 (1초마다 갱신).
  * 프로세스 트리 뷰(Parent-Child 계층 구조) 및 검색/필터링.
* **3.2 Process Lifecycle Management**:
  * 선택한 PID에 대해 시그널 전송 (`SIGTERM`, `SIGKILL`, `SIGHUP`, `SIGSTOP`).
  * 사용자 확인 모달 및 보안 2단계 인증/확인 토큰 적용.
* **3.3 Systemd & Docker Container Monitor**:
  * 주요 서비스 데몬(`nginx`, `docker`, `mysql`, `nexus-agent` 등) Active/Inactive/Failed 상태 표시 및 재시작/중지.
  * Docker 컨테이너 목록, CPU/MEM 점유율, 컨테이너 재시작 액션.

### Module 4: Integrated Web Terminal & Remote Exec (웹 SSH 터미널)
* **4.1 Browser SSH/PTY Session**:
  * WebSocket 기반 xterm.js 터미널로 서버 쉘(Bash/Zsh) 즉각 연결.
  * 리사이즈 자동 동기화(Rows/Cols), ANSI 컬러 풀 지원, 클립보드 복사/붙여넣기.
* **4.2 Audit & Session Recording**:
  * 실행된 커맨드 히스토리 및 세션 접속 이력 자동 감사 로깅.

### Module 5: Smart Alerting & Incident Rule Engine (알람 및 인시던트)
* **5.1 Flexible Metric Rules**:
  * 조건식 구성: `CPU > 90% for 30s`, `Memory > 95%`, `Disk Free < 10%`, `Node Heartbeat Lost > 15s`.
* **5.2 Multi-Channel Notification Dispatcher**:
  * Discord Webhook, Slack Incoming Webhook, Telegram Bot, Custom REST Webhook, Email(SMTP).
* **5.3 Automated Remediation (자가 치유)**:
  * 알람 발화 시 지정된 Bash 스크립트 실행 또는 서비스 자동 재시작(예: 메모리 고갈 시 캐시 비우기, 서비스 재시작).

### Module 6: Structured Log Streamer (실시간 로그 뷰어)
* **6.1 Live Tail Stream**:
  * `/var/log/syslog`, `journalctl`, Docker 컨테이너 로그 실시간 스트리밍.
* **6.2 Regex Search & Level Highlighting**:
  * Error, Warn, Info, Debug 컬러 하이라이팅, 실시간 정규식 필터링, 정지(Pause/Resume).

### Module 7: Historical Analytics & Reporting (통계 및 리포트)
* **7.1 Time-range Aggregation**:
  * 1시간, 24시간, 7일, 30일 간격 평균/최대/P95/P99 지표 산출.
* **7.2 Export**:
  * CSV 데이터 내보내기, JSON 덤프, PDF 서머리 리포트 생성.

### Module 8: Multi-Tenant RBAC & Security (보안 및 권한 관리)
* **8.1 User Roles**:
  * `SuperAdmin` (모든 권한 + 유저/서버 관리 + 터미널 풀 제어)
  * `Operator` (모니터링 + 프로세스 재시작 + 알람 설정)
  * `Viewer` (읽기 전용 모니터링)
* **8.2 Agent Authentication**:
  * API Key / Secret Token 기반 에이전트 등록 및 암호화 통신.

---

## 5. Data Models & Schemas

### 5.1 System Telemetry Snapshot (`SystemTelemetrySnapshot`)
```typescript
export interface SystemTelemetrySnapshot {
  nodeId: string;
  hostname: string;
  timestamp: number; // Unix timestamp in ms
  uptime: number;    // seconds
  os: {
    platform: string;
    distro: string;
    release: string;
    arch: string;
  };
  cpu: {
    overallUsage: number; // 0.0 ~ 100.0 %
    coreUsage: number[];  // per core %
    loadAverage: [number, number, number]; // 1m, 5m, 15m
    temperature?: number; // Celsius
    frequencyGhz?: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    cachedBytes: number;
    buffersBytes: number;
    usagePercent: number;
    swapTotalBytes: number;
    swapUsedBytes: number;
    swapPercent: number;
  };
  disks: Array<{
    fs: string;
    mount: string;
    type: string;
    sizeBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
    readBytesPerSec: number;
    writeBytesPerSec: number;
    iops: number;
  }>;
  network: Array<{
    iface: string;
    rxBytesPerSec: number;
    txBytesPerSec: number;
    rxPacketsPerSec: number;
    txPacketsPerSec: number;
    rxDropped: number;
    txDropped: number;
    isUp: boolean;
  }>;
  processesSummary: {
    total: number;
    running: number;
    sleeping: number;
    zombie: number;
  };
  gpu?: Array<{
    index: number;
    name: string;
    utilizationPercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    temperatureCelsius: number;
  }>;
}
```

### 5.2 Process Item (`ProcessItem`)
```typescript
export interface ProcessItem {
  pid: number;
  ppid: number;
  name: string;
  user: string;
  cpuPercent: number;
  memoryPercent: number;
  memoryRssBytes: number;
  status: 'running' | 'sleeping' | 'stopped' | 'zombie';
  command: string;
  startedAt: string;
  ioReadBytesPerSec?: number;
  ioWriteBytesPerSec?: number;
}
```

### 5.3 Alert Rule & Incident Model
```typescript
export interface AlertRule {
  id: string;
  nodeId?: string; // specific node or '*' for global
  name: string;
  metric: 'cpu.usage' | 'memory.usage' | 'disk.usage' | 'network.dropped' | 'node.offline';
  condition: 'gt' | 'lt' | 'eq';
  threshold: number;
  durationSeconds: number; // e.g. 30s sustained
  severity: 'info' | 'warning' | 'critical';
  channels: Array<'discord' | 'slack' | 'email' | 'webhook'>;
  webhookUrl?: string;
  autoAction?: {
    type: 'restart_service' | 'kill_pid' | 'exec_script';
    target: string;
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertIncident {
  id: string;
  ruleId: string;
  ruleName: string;
  nodeId: string;
  nodeName: string;
  severity: 'info' | 'warning' | 'critical';
  triggeredValue: number;
  threshold: number;
  status: 'active' | 'acknowledged' | 'resolved';
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  notes?: string;
}
```

---

## 6. REST API & WebSocket Specifications

### 6.1 REST API Contracts

Base URL: `/api/v1`

#### Auth & Node Management
* **POST `/api/v1/auth/login`**:
  * Request: `{ "username": "admin", "password": "..." }`
  * Response: `{ "token": "jwt_token_here", "user": { "id": "u1", "username": "admin", "role": "SuperAdmin" } }`
* **GET `/api/v1/nodes`**:
  * Response: `[ { "id": "node-1", "name": "Prod-API-01", "ip": "192.168.1.10", "status": "online", "agentVersion": "1.0.0", "lastSeen": 1724759900000 } ]`
* **POST `/api/v1/nodes`**:
  * Request: `{ "name": "Prod-Worker-02", "ip": "192.168.1.11", "tags": ["prod", "gpu"] }`
  * Response: `{ "id": "node-2", "apiKey": "nxp_sec_xxx..." }`
* **DELETE `/api/v1/nodes/:id`**: 노드 등록 해제

#### Historical Telemetry & Analytics
* **GET `/api/v1/telemetry/:nodeId/history?range=1h&resolution=10s`**:
  * Response: `{ "timestamps": [1724756300000, ...], "cpu": [45.2, ...], "memory": [68.1, ...], "netRx": [...], "netTx": [...] }`
* **GET `/api/v1/telemetry/:nodeId/metrics/export?format=csv&range=24h`**: 파일 다운로드 스트림

#### Processes & Control
* **GET `/api/v1/nodes/:nodeId/processes?limit=100&sortBy=cpu`**:
  * Response: `{ "processes": ProcessItem[], "totalCount": 240 }`
* **POST `/api/v1/nodes/:nodeId/processes/:pid/signal`**:
  * Request: `{ "signal": "SIGTERM" }`
  * Response: `{ "success": true, "message": "Signal SIGTERM sent to PID 12455" }`
* **GET `/api/v1/nodes/:nodeId/services`**:
  * Response: `[ { "unit": "nginx.service", "activeState": "active", "subState": "running", "description": "Nginx HTTP Server" } ]`
* **POST `/api/v1/nodes/:nodeId/services/:serviceName/action`**:
  * Request: `{ "action": "restart" | "stop" | "start" }`
  * Response: `{ "success": true }`

#### Alerts & Incidents
* **GET `/api/v1/alerts/rules`**: 등록된 알람 규칙 리스트 조회
* **POST `/api/v1/alerts/rules`**: 새 알람 규칙 생성
* **PUT `/api/v1/alerts/rules/:id`**: 알람 규칙 수정
* **DELETE `/api/v1/alerts/rules/:id`**: 알람 규칙 삭제
* **GET `/api/v1/alerts/incidents?status=active`**: 활성 인시던트 조회
* **POST `/api/v1/alerts/incidents/:id/ack`**: 인시던트 인지(Acknowledge)
* **POST `/api/v1/alerts/incidents/:id/resolve`**: 인시던트 수동 해결

---

### 6.2 WebSocket Protocol Specification

WebSocket Endpoint: `/ws/telemetry` (클라이언트 및 에이전트 공용)

#### Connection Handshake
* **Client -> Server**:
  ```json
  {
    "type": "CLIENT_AUTH",
    "token": "bearer_jwt_token_here",
    "subscriptions": ["node-1", "node-2"]
  }
  ```
* **Agent -> Server**:
  ```json
  {
    "type": "AGENT_HANDSHAKE",
    "nodeId": "node-1",
    "apiKey": "nxp_sec_xxx",
    "hostname": "prod-api-01",
    "os": { "platform": "linux", "distro": "Ubuntu 24.04", "arch": "x64" }
  }
  ```

#### Live Telemetry Frames (Agent -> Server -> Client Broadcast)
```json
{
  "type": "METRIC_BROADCAST",
  "nodeId": "node-1",
  "timestamp": 1724759910000,
  "data": {
    "cpu": { "overallUsage": 32.4, "coreUsage": [28.1, 35.2, 40.0, 26.3], "loadAvg": [1.2, 0.9, 0.7] },
    "memory": { "usedPercent": 64.2, "usedBytes": 8589934592, "totalBytes": 17179869184 },
    "diskIO": { "readMBs": 1.25, "writeMBs": 8.41, "iops": 180 },
    "netIO": { "rxKBs": 450.2, "txKBs": 1240.8 },
    "topProcess": { "pid": 3412, "name": "node", "cpu": 18.2, "mem": 4.1 }
  }
}
```

#### Terminal WebSocket Endpoint: `/ws/terminal/:nodeId`
* **Client -> Server (PTY Input)**:
  * Binary or `{ "type": "INPUT", "data": "ls -la\r" }`
  * Resize: `{ "type": "RESIZE", "cols": 120, "rows": 32 }`
* **Server -> Client (PTY Output)**:
  * Plain text stream or `{ "type": "OUTPUT", "data": "\u001b[32muser@node-1\u001b[0m:~$ " }`

---

## 7. UI/UX Design System & Layout Blueprint

### 7.1 Cyberpunk / High-Contrast Dark Theme Palette
* **Background Primary**: `#0B0F19` (Deep Slate Obsidian)
* **Surface Secondary / Cards**: `#111827` / `#1F2937` with subtle glassmorphic border `#374151`
* **Accent Primary (Cyan Neon)**: `#06B6D4` / `#22D3EE` (Primary Action & Network Rx)
* **Accent Secondary (Violet Glow)**: `#8B5CF6` / `#A78BFA` (Network Tx & Memory)
* **Status Colors**:
  * **Success / Healthy**: `#10B981` (Emerald Green)
  * **Warning**: `#F59E0B` (Amber Flame)
  * **Critical / Alert**: `#EF4444` (Vibrant Crimson)
  * **Info**: `#3B82F6` (Electric Blue)

### 7.2 Main Dashboard Layout Structure
```
+--------------------------------------------------------------------------------------+
| [NexusPulse Logo]  [Cluster: All Nodes v]  [Search / Filter]  [Alerts (3)]  [Admin v] |
+--------------------------------------------------------------------------------------+
| [Dashboard] [Nodes] [Live Top] [Processes] [Logs] [Terminal] [Alerts] [Settings]     |
+--------------------------------------------------------------------------------------+
| [Summary Cards: Nodes: 8/8 Online | Avg CPU: 38% | Avg Mem: 62% | Net Total: 85MB/s] |
+------------------------------------+-------------------------------------------------+
|  Node Realtime Matrix (Grid)       |  Focused Node: [prod-api-01 v]                  |
|  +--------------+ +--------------+ |  +--------------------------------------------+ |
|  | prod-api-01  | | prod-api-02  | |  | [Live CPU Sparkline & Per-Core Gauges]     | |
|  | CPU: 42%     | | CPU: 18%     | |  | [Live Memory & Swap Allocation Breakdown] | |
|  +--------------+ +--------------+ |  +--------------------------------------------+ |
|  | prod-db-01   | | prod-redis-01| |  | [Disk I/O Throughput & IOPS Graph]         | |
|  | CPU: 78% (!) | | CPU: 12%     | |  | [Network Inbound/Outbound Waterfall]       | |
|  +--------------+ +--------------+ |  +--------------------------------------------+ |
+------------------------------------+-------------------------------------------------+
|  Live Process Table (Top 10)       |  Live System Logs / Alerts Feed                 |
|  [PID | Name | CPU% | MEM% | Act]  |  [11:58:20] [WARN] High disk write on /data     |
+------------------------------------+-------------------------------------------------+
```

---

## 8. Role-by-Role Execution Roadmap & Action Plan

### 8.1 UI/UX Designer & Frontend Architect Roadmap
- [ ] **Phase 1: Design Tokens & Layout Engine**
  - Tailwind CSS 색상 팔레트, 폰트(Inter/JetBrains Mono), 글래스모피즘 컴포넌트 토큰 정의.
  - 반응형 3패널 레이아웃(사이드바 네비게이션, 노드 그리드, 상세 텔레메트리 뷰).
- [ ] **Phase 2: High-Performance Widget Components**
  - Gauge Widget (반원/원형 SVG SVG 게이지 with 애니메이션).
  - Multi-Core CPU Matrix Grid 컴포넌트.
  - uPlot / Canvas 기반 실시간 스트리밍 시계열 차트 래퍼.
  - Interactive Process Table (정렬, 필터링, Kill 액션 모달).
  - xterm.js WebGL 터미널 모달 및 임베디드 탭.
- [ ] **Phase 3: Realtime Data Hooks & Performance Tuning**
  - `useTelemetryStream` WebSocket 훅 구현 (자동 재연결, 패킷 디바운싱, 백오프).
  - 60fps 렌더링을 위한 React 컴포넌트 메모이제이션(`React.memo`, `useCallback`).

---

### 8.2 Backend Engineer Roadmap
- [ ] **Phase 1: Server Core & Database Foundation**
  - Node.js + Fastify + TypeScript 프로젝트 구성.
  - SQLite (WAL 모드) 스키마 정의 (`nodes`, `alert_rules`, `incidents`, `users`, `audit_logs`).
  - In-Memory Ring Buffer 기반 최근 1시간(3,600개 스냅샷) 텔레메트리 링 버퍼 구현.
- [ ] **Phase 2: WebSocket Telemetry & Agent Ingestion Engine**
  - `/ws/telemetry` 고속 소켓 채널 구축.
  - Node Agent 등록 및 인증(API Key) 핸드셰이크.
  - 클라이언트 브로드캐스트 라우팅 및 룸(Room) 기반 노드 구독 관리.
- [ ] **Phase 3: Alert Evaluation & Dispatch Engine**
  - 매초 유입되는 텔레메트리 스냅샷을 알람 규칙과 대조 평가하는 비동기 워커.
  - Discord/Slack/Email 웹훅 디스패처 및 쿨다운(Dedup/Throttling) 로직.
- [ ] **Phase 4: Agent Daemon & Remote Exec/PTY Bridge**
  - `systeminformation` / OS 네이티브 수집 기반 에이전트 데몬 구현.
  - 프로세스 목록 조회 및 `kill(pid, signal)` API 연동.
  - `node-pty` / `ssh2` 기반 터미널 WebSocket 브릿지 구축.

---

### 8.3 Frontend Developer Roadmap
- [ ] **Phase 1: Client Project Scaffold & State Management**
  - Vite + React 19 + TypeScript + Zustand + Tailwind 프로젝트 세팅.
  - React Router 라우팅 구성 (`/dashboard`, `/nodes`, `/processes`, `/logs`, `/alerts`, `/terminal`, `/settings`).
- [ ] **Phase 2: Realtime Dashboard & Chart Integration**
  - 노드 요약 헤더 및 실시간 클러스터 상태 위젯 연결.
  - CPU/Memory/Disk/Network 실시간 차트 구현.
  - 프로세스 탭: 검색, 정렬, Kill 모달 API 트리거 연동.
- [ ] **Phase 3: Web Terminal & Log Viewer Implementation**
  - xterm.js 터미널 연결 및 양방향 키 스트로크 입출력 테스트.
  - 실시간 로그 tail 뷰어 (자동 스크롤, 정규식 하이라이트, 일시정지).
- [ ] **Phase 4: Alert Management & Settings UI**
  - 알람 규칙 생성/수정/삭제 폼 및 웹훅 테스트 버튼.
  - 활성 인시던트 알람 팝업 및 원클릭 인지/해결 액션.

---

### 8.4 QA & Test Engineer Roadmap
- [ ] **Phase 1: Unit & Contract Testing**
  - REST API 엔드포인트 Vitest/Supertest 기반 테스트 슈트 작성.
  - WebSocket 프레임 직렬화/역직렬화 및 유효성 검사 테스트.
- [ ] **Phase 2: Stress & High-Load Benchmark**
  - 10개 노드 동시 100ms 간격 텔레메트리 전송 시 서버 CPU 점유율 및 메모리 누수 테스트.
  - 프론트엔드 60fps 유지 여부 및 브라우저 메모리 프로파일링.
- [ ] **Phase 3: Chaos & Resilience Testing**
  - 네트워크 단절 후 WebSocket 자동 복구(Auto-reconnect) 검증.
  - 에이전트 비정상 종료 시 Server 상태 전이(`warning` -> `offline`) 및 알람 발화 검증.
- [ ] **Phase 4: E2E Scenario Testing**
  - Playwright 기반 사용자 시나리오(로그인 -> 노드 확인 -> 프로세스 종료 -> 알람 확인) E2E 자동화.

---

## 9. Security, Reliability & Performance Guardrails

1. **Agent Security**:
   - 에이전트와 서버 간의 모든 통신은 WSS / HTTPS로 암호화.
   - PTY/터미널 실행은 Role이 `SuperAdmin`인 사용자에게만 허용되며, 모든 입력 명령은 `audit_logs` 테이블에 영구 보관.
2. **Resource Throttling**:
   - 에이전트의 자체 리소스 점유율 제한: CPU 최대 2% 이하, RAM 최대 50MB 이하 강제.
   - 클라이언트 렌더링 부하 방지를 위해 초당 최대 10프레임 이상 렌더링 방지(Throttled state update).
3. **Data Retention & Downsampling Policy**:
   - 실시간 고해상도(1초 간격): 최근 2시간 링 버퍼 보관.
   - 중간 해상도(10초 간격): 24시간 보관.
   - 저해상도(1분 간격): 30일 보관 및 자동 파티션 드롭.

---

## 10. Implementation Execution Plan (Sprint Matrix)

| 스프린트 | 기간 | 주요 산출물 | 책임자 |
| :--- | :--- | :--- | :--- |
| **Sprint 1** | Week 1 | • 프로젝트 스캐폴딩 및 타입 정의 (`types/telemetry.ts`)<br>• Backend Fastify 서버 & WS 엔진 구축<br>• 에이전트 수집기 프로토타입 (`systeminformation`)<br>• Frontend 대시보드 레이아웃 및 링버퍼 연동 | Backend / Frontend |
| **Sprint 2** | Week 2 | • 실시간 4종 차트(CPU, RAM, Disk, Net) 완성<br>• 실시간 프로세스 뷰어 및 Kill 제어 API<br>• xterm.js 웹 터미널 연동 | Frontend / Backend / Designer |
| **Sprint 3** | Week 3 | • 알람 엔진 및 Discord/Slack 웹훅 연동<br>• 실시간 로그 스트리머 컴포넌트<br>• 다중 노드 클러스터 그리드 뷰 완성 | Full Team |
| **Sprint 4** | Week 4 | • 부하 테스트(1,000+ metrics/sec) & 메모리 튜닝<br>• E2E 테스트 및 배포 패키징(Docker Compose / Single Binary)<br>• v1.0.0 정식 릴리즈 | QA / DevOps / Lead |

---
*End of PRD & Architecture Specification.*
