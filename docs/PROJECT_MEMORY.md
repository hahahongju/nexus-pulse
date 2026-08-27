# 🧠 NexusPulse Project Memory & Knowledge Base

이 문서는 **NexusPulse (넥서스펄스)** 프로젝트의 전체 아키텍처, 서버 환경 설정, 가상화/컨테이너 스택, 기능 명세 및 운영 가이드를 보존하기 위한 통합 메모리 문서입니다.

---

## 1. 📌 프로젝트 개요 및 핵심 메타데이터

- **프로젝트 명**: NexusPulse (넥서스펄스) - Next-Gen Server Telemetry & Operations OS
- **로컬 디렉토리**: `/home/hongju/workspace/nexus-pulse/`
- **GitHub 저장소**: [https://github.com/hahahongju/nexus-pulse](https://github.com/hahahongju/nexus-pulse)
- **기본 서비스 포트**: `4500` (HTTP & WebSocket 통합)
- **주요 기술 스택**:
  - **Backend**: Node.js v22, Express, WebSocket (`ws`), Linux `/proc` 커널 파서, `child_process` (Docker & Libvirt virsh 래퍼)
  - **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Web Audio API 사운드 신디사이저, HTML5 Canvas 60fps 오실로스코프
  - **운영 환경**: Ubuntu 26.04 LTS (Linux 7.0.0-14-generic, x86_64), AMD Ryzen 5 PRO 6650H (12 Cores), 11.9 GB RAM, Bare-Metal 물리 서버

---

## 2. 🏗️ 시스템 아키텍처 및 모듈 구성

```
nexus-pulse/
├── client/                     # React 18 + TypeScript 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx             # 상단 허브, 테마(4종), 볼륨, 폴링 주기(500ms~5s)
│   │   │   ├── HeroCards.tsx          # CPU/RAM/Disk/Net 실시간 4대 요약 카드
│   │   │   ├── CpuMatrix.tsx          # 12코어 개별 점유율 매트릭스 & Load Average
│   │   │   ├── MemoryStorageView.tsx  # RAM/Swap 세부 분할 & 디스크 I/O
│   │   │   ├── NetworkView.tsx        # 7개 네트워크 어댑터 Rx/Tx 속도계
│   │   │   ├── TimeSeriesCharts.tsx   # Canvas 60FPS 실시간 시계열 오실로스코프
│   │   │   ├── ProcessManager.tsx     # 실시간 프로세스 탐색, 정렬 및 Kill (SIGTERM/SIGKILL)
│   │   │   ├── ContainerView.tsx      # 도커 엔진 & 컨테이너 플릿 (Start/Stop/Restart/Pause/Delete/Logs)
│   │   │   ├── VirtualizationView.tsx # KVM/QEMU 가상머신 (Start/Shutdown/Destroy/Reboot/Pause)
│   │   │   ├── SystemLogsTerminal.tsx # 커널/시스템 로그 실시간 스트리밍 & Export
│   │   │   ├── BenchmarkSuite.tsx     # 안전한 CPU/RAM 스트레스 부하 생성기
│   │   │   ├── PortScanner.tsx        # 열린 TCP/UDP 포트 & 바인딩 PID 스캐너
│   │   │   ├── AlertsBanner.tsx       # 지능형 경보 배너 & 임계값 슬라이더 설정
│   │   │   └── Tooltip.tsx            # 지연 없는 사이버펑크 네온 플로팅 툴팁 컴포넌트
│   │   ├── services/
│   │   │   ├── sound.ts               # Web Audio API 기반 미래형 전자음 신디사이저
│   │   │   └── websocket.ts           # 자동 재연결 지원 WebSocket 클라이언트
│   │   └── types/telemetry.ts         # 정밀 텔레메트리 TypeScript 인터페이스
├── server/                     # 고성능 텔레메트리 백엔드
│   ├── telemetry.js           # Linux 커널 /proc 고속 수집, Docker & Virsh 제어 엔진
│   └── index.js               # Express REST API, SPA 정적 서빙, WebSocket 브로드캐스터
├── scripts/                    # E2E 테스트 및 검증 스위트
│   └── verify-full-stack.js   # 9단계 전계층 자동화 통합 검증 스크립트
├── docs/                       # 기획 및 디자인 문서
│   ├── PRD_ARCHITECTURE.md    # 제품 기획서 & 아키텍처 명세서
│   ├── DESIGN_SYSTEM.md       # 4종 테마 & 사운드 디자인 시스템
│   └── PROJECT_MEMORY.md      # 통합 프로젝트 메모리 & 지식 문서
├── nexuspulse.service          # systemd 백그라운드 서비스 유닛
└── start.sh                    # 원클릭 프로덕션 빌드 & 실행 스크립트
```

---

## 3. ⚡ 하이퍼바이저, 가상화 및 컨테이너 관제 세부 사양

### 가상머신 (KVM / QEMU / Libvirt)
- **하드웨어 가상화**: AMD-V (`svm`) 하드웨어 플래그 및 `/dev/kvm` 커널 가속 디바이스 활성화.
- **현재 활성 VM**: `win-vpn` (도메인 ID: `3`, 4 vCPUs, 6.0 GB RAM, SPICE Port `:5900`, QEMU PID `89335`).
- **가상 네트워크 브리지**: `virbr0` (192.168.122.1), `vnet2` (TAP 인터페이스).
- **웹 조작 기능**:
  - `START`: `virsh -c qemu:///system start <name>`
  - `ACPI SHUTDOWN`: `virsh -c qemu:///system shutdown <name>`
  - `REBOOT`: `virsh -c qemu:///system reboot <name>`
  - `PAUSE / RESUME`: `virsh -c qemu:///system suspend` / `resume <name>`
  - `FORCE DESTROY`: `virsh -c qemu:///system destroy <name>` (강제 전원 차단 확인 모달 포함)

### 도커 컨테이너 (Docker Engine v29.1.3)
- **런타임 엔진**: `containerd`, `docker` (스토리지 드라이버: `overlay2`, Cgroups: `systemd`).
- **웹 조작 기능**:
  - `START` / `STOP` / `RESTART` / `PAUSE` / `UNPAUSE`
  - `DELETE` (`docker rm -f` 및 확인 모달)
  - `LIVE LOGS` (실시간 stdout/stderr 타임스탬프 터미널 뷰어)
  - `DEPLOY DEMO CONTAINER` (원클릭 테스트 Nginx 웹서버 배포)

---

## 4. 📡 REST & WebSocket 통신 규약

| 프로토콜 | 경로 / 타입 | 주요 파라미터 / 페이로드 | 설명 |
|---|---|---|---|
| **GET** | `/api/health` | - | 서버 상태 및 가동 시간 확인 |
| **GET** | `/api/system/overview` | - | CPU, 메모리, OS 등 고정 하드웨어 사양 |
| **GET** | `/api/system/metrics` | - | 실시간 CPU %, 코어별 점유율, RAM, 디스크, 네트워크 I/O |
| **GET** | `/api/system/processes` | `?sort=cpu\|mem&limit=50&search=...` | 프로세스 목록 조회 |
| **POST** | `/api/system/processes/kill` | `{ pid: number, signal: 'SIGTERM'\|'SIGKILL' }` | 프로세스 종료 |
| **GET** | `/api/containers` | - | Docker 데몬 상태 및 컨테이너별 실시간 메트릭 |
| **POST** | `/api/containers/:id/:action` | `action: start\|stop\|restart\|pause\|unpause\|remove` | 컨테이너 라이프사이클 제어 |
| **DELETE**| `/api/containers/:id` | - | 컨테이너 강제 삭제 (`docker rm -f`) |
| **GET** | `/api/containers/:id/logs` | `?tail=100` | 컨테이너 실시간 콘솔 로그 |
| **POST** | `/api/containers/demo/deploy`| - | 테스트용 샘플 컨테이너 실행 |
| **GET** | `/api/virtualization` | - | 시스템 가상화 역할, HW 플래그, KVM VM 목록, 브리지 |
| **POST** | `/api/vms/:name/:action` | `action: start\|shutdown\|destroy\|reboot\|pause\|resume` | 가상머신 제어 |
| **POST** | `/api/benchmark/start` | `{ durationSec: number, cpuCores: number, ramMb: number }` | 스트레스 부하 인가 |
| **POST** | `/api/benchmark/stop` | - | 스트레스 부하 즉시 중단 |
| **WS** | `ws://localhost:4500/ws` | `tick` (1초 주기), `init`, `container_action`, `vm_action` | 전이중 실시간 스트림 |

---

## 5. 🚀 유지보수 및 실행 명령어

```bash
# 1. 원클릭 전체 빌드 및 실행
bash /home/hongju/workspace/nexus-pulse/start.sh

# 2. 백엔드 서버 단독 실행
cd /home/hongju/workspace/nexus-pulse && node server/index.js

# 3. 프론트엔드 빌드 (TypeScript + Vite)
npm --prefix /home/hongju/workspace/nexus-pulse/client run build

# 4. E2E 전체 스택 자동 검증 테스트
node /home/hongju/workspace/nexus-pulse/scripts/verify-full-stack.js

# 5. systemd 서비스 등록 및 자동 시작
sudo cp /home/hongju/workspace/nexus-pulse/nexuspulse.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexuspulse
```
