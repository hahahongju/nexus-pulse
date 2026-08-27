# ⚡ NexusPulse (넥서스펄스)
> **Next-Gen Autonomous Real-Time Server Telemetry & Operations OS**  
> 차세대 실시간 리눅스 서버 관제, 텔레메트리 및 원격 오퍼레이션 대시보드 시스템

---

## 🚀 프로젝트 개요
**NexusPulse**는 리눅스 서버의 하드웨어 리소스, 프로세스 상태, 네트워크 대역폭, 스토리지 I/O, 시스템 로그를 1밀리초 단위로 수집하여 미래지향적인 Cyber HUD 인터페이스로 실시간 브로드캐스팅하는 고성능 단일 올인원(All-in-One) 모니터링 시스템입니다.

가상 전문 팀(PM, Lead UI/UX Designer, Senior Backend Architect, Senior Frontend Engineer, Principal QA)의 협업 프로세스를 통해 설계 및 빌드되었습니다.

---

## 🌟 주요 핵심 기능

### 1. 실시간 텔레메트리 HUD (Overview)
- **CPU Multi-Core Topology**: 전체 CPU 사용률 및 12코어(동적 코어 감지) 실시간 히트맵 및 부하 게이지.
- **Memory & Swap Breakdown**: Total, Used, Active, Buffers/Cache, Available RAM 및 Swap 사용률 분할 시각화.
- **Storage & Disk Mounts**: 루트(`/`) 및 모든 마운트 파티션 용량/점유율, 실시간 R/W IOPS 속도계.
- **Network I/O Speedometer**: 활성 인터페이스(eth0, lo, docker0, tailscale0 등)별 실시간 다운로드(Rx)/업로드(Tx) 속도 및 누적 트래픽.

### 2. 고속 시계열 오실로스코프 (60s Window Oscilloscope)
- HTML5 Canvas 기반 60FPS 하드웨어 가속 실시간 그래프.
- CPU, RAM, Network Rx/Tx, Disk R/W 시계열 데이터 실시간 렌더링.

### 3. 액티브 프로세스 익스플로러 (Process Manager)
- 실시간 CPU/RAM 점유율 기준 정렬 및 실시간 검색 필터.
- `SIGTERM` / `SIGKILL` 안전 신호 전송 및 프로세스 강제 종료 보안 모달.

### 4. 실시간 시스템 이벤트 로그 터미널 (Live Terminal)
- 서버 생명주기, 커널 이벤트, 알람 로그 실시간 스트리밍.
- 로그 레벨(INFO, WARN, ERROR, BENCHMARK) 필터링, 정규식 검색, 자동 스크롤 및 텍스트 파일 내보내기(Export).

### 5. 도커 & 컨테이너 플릿 관리 (Containers Fleet)
- **Docker Engine Telemetry**: 데몬 상태(Active/Inactive), 버전(`v29.1.3`), 스토리지 드라이버(`overlay2`), Cgroups 드라이버, 루트 디렉토리, 이미지 수.
- **실시간 컨테이너 모니터링**: 전체/실행 중(Running)/일시 정지(Paused)/중단(Stopped) 컨테이너 상태 분류.
- **컨테이너별 리소스 관제**: 실시간 CPU %, Memory 사용량/한도 %, Network I/O(Rx/Tx), Block I/O(R/W), 포트 바인딩 및 마운트 정보.
- **컨테이너 라이프사이클 제어**: Start, Stop, Restart, Pause 및 실시간 표준 출력(stdout/stderr) 터미널 로그 뷰어 모달.
- **1-클릭 샘플 컨테이너 배포**: 테스트용 컨테이너 즉시 실행 지원.

### 6. 가상화 & VM 하이퍼바이저 관제 (Virtualization & VMs)
- **하드웨어 가상화 지원 감지**: CPU `AMD-V (SVM)` / `Intel VT-x (VMX)` 가속 지원 여부 및 커널 `/dev/kvm` 활성화 상태.
- **시스템 가상화 역할 판별**: 베어메탈 물리 서버(Bare-Metal Master Host) vs 가상머신 게스트(KVM/QEMU/VMware/VirtualBox/WSL/Docker) 자동 식별.
- **가상화 스택 엔진 스캐너**: Docker, Podman, Containerd, Libvirt, QEMU, LXC 설치 및 구동 여부 매트릭스.
- **KVM/QEMU 가상머신 목록**: 등록된 VM 도메인 ID, 이름, 상태, vCPU 할당량, 메모리 할당량.
- **가상 네트워크 브리지**: `docker0`, `virbr0`, `br-*`, `veth*` 등 가상 브리지 및 veth 인터페이스 IP/MAC 실시간 매핑.

### 7. 서버 스트레스 & 벤치마크 테스트 스위트 (Stress Benchmark)
- 웹 UI에서 안전하게 CPU 코어별/메모리 할당 부하를 5초~60초간 인가하여 관제 화면의 실시간 반응성을 즉각 테스트할 수 있는 내장 부하 발생기.

### 8. 열린 포트 및 서비스 스캐너 (Ports & Sockets)
- 서버 내 리스닝 중인 TCP/UDP 포트, 바인딩 IP, 연계 프로세스(PID) 실시간 스캔.

### 9. 지능형 임계값 경보 & Web Audio 신디사이저 사운드
- CPU/RAM/Disk 임계값 슬라이더 설정.
- Web Audio API 기반 미래형 전자음(경보, 알람, 클릭, 탭 전환) 오디오 피드백 (온/오프 지원).

### 8. 4가지 프리셋 테마
- ⚡ **Cyber Neon** (기본 - 네온 시안 & 바이올렛)
- 🟢 **Matrix Terminal** (인광 에메랄드 & 딥 포레스트)
- 🌸 **Synthwave Sunset** (핫핑크 & 레이저 시안)
- 🔥 **Solar Flare** (슈퍼노바 앰버 & 오렌지)

---

## 🛠️ 기술 스택
- **Backend**: Node.js (v22+), Express, WebSocket (`ws`), `systeminformation` + Linux `/proc` Fast Reader
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide React, HTML5 Canvas Charts, Web Audio API
- **Deployment**: 단일 포트(`4500`) 통합 웹 & API & WebSocket 서빙

---

## 🏃 빠른 시작 가이드 (Quick Start)

### 1. 원클릭 실행 스크립트
```bash
./start.sh
```

### 2. npm 스크립트로 실행
```bash
# 프로덕션 빌드 및 서버 시작 (Port: 4500)
npm run build
npm start

# 또는 개발 모드
npm run dev:server
npm run dev:client
```

브라우저에서 `http://localhost:4500`으로 접속하시면 즉시 실시간 서버 모니터링이 시작됩니다.

---

## 📡 REST & WebSocket API 명세

| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/api/health` | GET | 서버 헬스체크 및 업타임 |
| `/api/system/overview` | GET | 호스트 하드웨어, OS 및 CPU/메모리 정적 스펙 |
| `/api/system/metrics` | GET | 최신 텔레메트리 스냅샷 (CPU, RAM, Disk, Net) |
| `/api/system/history` | GET | 최근 60초 시계열 롤링 버퍼 |
| `/api/system/processes` | GET | 프로세스 목록 (`?sort=cpu&limit=50&search=...`) |
| `/api/system/processes/kill`| POST | 프로세스 종료 (`{ pid, signal }`) |
| `/api/system/ports` | GET | 리스닝 중인 네트워크 포트 |
| `/api/containers` | GET | Docker 엔진 사양 및 컨테이너별 실시간 메트릭 |
| `/api/containers/:id/:action` | POST | 컨테이너 라이프사이클 제어 (`start`/`stop`/`restart`/`pause`) |
| `/api/containers/:id/logs` | GET | 컨테이너 실시간 로그 스트림 (`?tail=100`) |
| `/api/containers/demo/deploy` | POST | 1-클릭 샘플 테스트 컨테이너 배포 |
| `/api/virtualization` | GET | 시스템 가상화 역할, HW 가상화 플래그, KVM VM 목록 및 브리지 |
| `/api/benchmark/start` | POST | 스트레스 테스트 시작 (`{ durationSec, cpuCores, ramMb }`) |
| `/api/benchmark/stop` | POST | 스트레스 테스트 즉시 중단 |
| `/api/alerts` | GET/POST | 경보 규칙 조회 및 임계치 업데이트 |
| `/api/logs` | GET | 시스템 이벤트 로그 조회 |
| `/ws` | WebSocket | 1Hz 실시간 메트릭 스트리밍 및 양방향 제어 |

---

## 🧪 E2E 테스트 실행
```bash
node scripts/verify-full-stack.js
```
