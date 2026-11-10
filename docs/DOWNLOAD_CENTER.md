# NexusPulse Download Center

## 결정

별도 사용자용 프로젝트를 만들지 않고 NexusPulse에 `Downloads` 도메인을 통합한다. 다운로드 실행 경계는 다음처럼 분리한다.

```text
Browser -> NexusPulse API/UI -> Transmission RPC -> transmission-daemon
                            -> Download Worker -> yt-dlp / ffmpeg
                            -> mounted USB storage
```

한 화면에서 서버, 네트워크, 스토리지와 다운로드 상태를 함께 운영할 수 있고 기존 인증, 설정, 배포 UI를 중복하지 않는 장점이 있다. Transmission daemon을 단일 source of truth로 유지하므로 Transmission Remote GUI도 같은 RPC 큐를 계속 사용할 수 있다.

현재 MVP는 어댑터 검증을 위해 `yt-dlp`를 NexusPulse 프로세스의 자식 프로세스로 실행한다. 운영 버전에서는 큐 영속화와 장애 격리를 위해 별도 systemd worker 또는 컨테이너로 옮겨야 한다.

## 제공 기능

- Transmission 큐 조회, Magnet/HTTP(S) torrent URL 추가, 시작, 정지, 목록 제거
- `yt-dlp` 단일 URL 다운로드, 진행률/속도/ETA 표시, 실패 메시지 표시
- `yt-dlp` 출력을 비버퍼링하고 줄 단위로 누적 파싱해 장시간 작업도 진행률이 실시간 갱신됨
- 실패한 YouTube 작업을 항목별로 다시 시작/제거하거나 `실패 모두 재시작` / `실패 모두 정리`로 일괄 제어
- 일반 파일·YouTube 작업을 큐에서만 제거하거나, 실행을 중단하고 해당 작업의 임시 파일과 결과 파일까지 삭제
- YouTube 임시 파일은 작업별 `.nexuspulse-temp/<작업 ID>` 폴더에 분리하여 삭제 범위를 제한
- YouTube Pipeline은 실행 중 작업을 맨 위에 표시하고 탐색 중, 대기, 일시정지, 실패 순으로 정렬
- YouTube JavaScript challenge 처리를 위한 Node runtime과 공식 `yt-dlp/ejs` solver 사용
- 13인치 이하 태블릿 기본 프리셋: 최대 720p, H.264 영상, M4A 오디오, MP4 출력
- 요청별 화질 선택: 360p, 480p, 720p(기본), 1080p, 최고 화질, MP3 192K
- 파일명 형식: 읽을 수 있는 원본 한글 제목과 YouTube 영상 ID (`제목 [ID].mp4`)
- YouTube 작업 동시 실행 기본값 2개 (`YOUTUBE_CONCURRENCY`로 변경 가능)
- 완료 작업은 큐 화면에서 자동으로 숨기고 MP4 파일만 저장 폴더에 유지
- 웹 자연어 요청: 제한된 Hermes(`web,nexus_downloads`)를 통해 검색 후 큐 등록
- Hermes 요청별 대화 기록을 보존하며 같은 작업에서 조건 수정, 확인 답변, 재검색을 계속 진행
- 공식 파일 부재나 버전·언어·아키텍처가 불명확할 때 임의 대체 파일을 받지 않고 사용자에게 확인 질문
- Hermes 대화는 `data/hermes-conversations.json`에 저장되어 서비스 재시작 후에도 복원
- HTML 안내 페이지를 ISO/설치 파일 다운로드 완료로 오인하지 않도록 응답 콘텐츠 형식 검증
- Hermes의 콘텐츠 검색·선정 단계부터 작업을 표시하고, 등록된 영상은 `HERMES` 출처와 함께 기존 YouTube Pipeline에서 계속 추적
- Hermes 요청 API는 즉시 작업 ID를 반환하고 검색은 백그라운드에서 기본 15분까지 계속 수행
- Hermes Downloader는 전역 provider 장애의 영향을 피하도록 기본적으로 검증된 `custom:omniroute-fast/auto/pro-fast`를 사용
- Linux 물리 마운트 탐지와 용량/여유 공간 표시
- 기본 저장 디렉터리 설정 및 쓰기 가능 여부 진단
- 다운로드 실행 도구 설치 여부와 Transmission RPC 연결 상태 표시
- 데스크톱/모바일 대응 Downloads 탭

설정은 기본적으로 `data/downloads.json`에 mode `0600`으로 기록되며 Git에 포함되지 않는다. `NEXUSPULSE_CONFIG_DIR`과 `DOWNLOAD_DIR` 환경변수로 위치를 바꿀 수 있다.
Hermes 전용 provider와 모델은 각각 `HERMES_DOWNLOAD_PROVIDER`, `HERMES_DOWNLOAD_MODEL` 환경변수로 재정의할 수 있다. 검색 제한시간은 `HERMES_DOWNLOAD_TIMEOUT_MS`로 설정하며 허용 범위는 3~30분, 기본값은 15분이다.

## 운영 준비

### 1. 저장 장치

USB 장치는 `/etc/fstab`에서 UUID로 고정 마운트하고, 서비스가 시작되기 전에 마운트가 완료되도록 한다. 이 서버에서 감지된 후보는 `/mnt/storage`, `/mnt/work`, `/mnt/newdesk`이다. 기본 제안 경로는 `/mnt/storage/downloads`이다.

```bash
sudo install -d -o hongju -g debian-transmission -m 2775 /mnt/storage/downloads
sudo setfacl -m u:debian-transmission:rwx,u:hongju:rwx /mnt/storage/downloads
sudo setfacl -d -m u:debian-transmission:rwx,u:hongju:rwx /mnt/storage/downloads
```

장치가 미마운트된 상태에서 동일 경로가 루트 디스크의 일반 디렉터리로 남으면 다운로드를 시작하지 않도록 운영 worker에서 mount source/UUID 검사를 강제해야 한다.

### 2. YouTube 도구

```bash
sudo apt update
sudo apt install yt-dlp ffmpeg
```

사이트 변경 대응을 위해 `yt-dlp` 버전과 업데이트 정책은 NexusPulse 배포와 분리한다. 다운로드 권한이 있는 콘텐츠에만 사용하며 DRM 또는 접근 제어 우회는 지원 범위가 아니다.

### 3. Transmission Remote GUI

Remote GUI는 Transmission daemon RPC에 직접 연결한다. NexusPulse가 RPC 프로토콜을 대체하지 않으므로 웹 화면과 Remote GUI가 같은 큐를 본다. RPC 포트는 인터넷에 공개하지 말고 LAN/Tailscale 또는 SSH 터널에서만 접근한다.

#### 현재 서버 복구 설정 (2026-10-23)

서버에 `transmission-remote`만 설치되어 있고 daemon이 없어 `연결 끊김`이 발생했다. Ubuntu 저장소의 `transmission-daemon` 패키지를 사용자 경로 `~/.local/lib/transmission`에 추출하여 설치했다. 시스템 패키지로 등록되지 않으므로 daemon 업데이트는 해당 경로의 패키지도 별도로 갱신해야 한다.

- 실행 서비스: `systemctl --user status nexuspulse-transmission.service`
- 서비스 파일: `~/.config/systemd/user/nexuspulse-transmission.service`
- 상태/큐 저장: `~/.config/transmission-daemon`
- RPC: `127.0.0.1:9091` (로컬 접근만 허용, 외부 GUI는 SSH 터널 사용)
- 다운로드 경로: `/mnt/work/downloads`, 시작 전에 `/mnt/work` 마운트 확인
- 사용자 서비스 자동 시작 활성화, `myadmin`의 linger 활성화 확인
- 연결 점검: `transmission-remote -l`

토렌트 화면은 다른 다운로드 API와 독립적으로 조회를 마친 뒤 3초마다 다시 연결을 시도한다. 응답이 없는 요청은 10초 후 취소하며, 네트워크 복구 또는 탭 복귀 시 즉시 조회한다. 연결 실패 시 `재연결 대기 중`을 표시하고 서비스가 나중에 실행되면 새로고침 없이 `연결됨`으로 복구된다.

사용자 서비스는 `Restart=always`, `RestartSec=5`, `StartLimitIntervalSec=0`으로 설정하여 저장 장치가 늦게 마운트되거나 프로세스가 종료되어도 재시도를 지속한다. 관리자가 명시적으로 `systemctl --user stop`한 경우는 자동 재시작하지 않는다.

브라우저 회귀 검사: `node scripts/test-torrent-reconnect.js` (Puppeteer Chrome 필요). 늦은 시작, 다른 API 장애, 네트워크 실패, 응답 시간 초과 후 자동 복구를 검증한다.

로그인 세션 환경변수가 없는 셸에서는 `XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`를 지정하여 사용자 서비스를 관리한다.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/downloads/status` | 도구, 설정, 마운트 상태 |
| `POST` | `/api/downloads/request` | Hermes 자연어 다운로드 요청 |
| `POST` | `/api/downloads/hermes/:id/messages` | 기존 Hermes 요청에 후속 메시지 전송 |
| `PUT` | `/api/downloads/settings` | 기본 저장 경로 변경 |
| `GET` | `/api/downloads/transmission` | Torrent 큐 조회 |
| `POST` | `/api/downloads/transmission` | Magnet/torrent URL 추가 |
| `POST` | `/api/downloads/transmission/:id/:action` | `start`, `stop`, `remove`, `delete` |
| `GET` | `/api/downloads/youtube` | YouTube 작업 조회 |
| `POST` | `/api/downloads/youtube` | YouTube URL 작업 시작 |
| `POST` | `/api/downloads/youtube/:id/:action` | `pause`, `resume`, `cancel`, `retry`, `remove`, `delete` |
| `POST` | `/api/downloads/youtube/failed/retry` | 실패한 YouTube 작업 일괄 재시작 |
| `POST` | `/api/downloads/youtube/failed/clear` | 실패한 YouTube 작업 기록 일괄 제거 |

## 운영 전 필수 보강

1. 현재 NexusPulse의 `CORS: *`, 무인증 REST/WS, `0.0.0.0` 수신을 그대로 인터넷에 노출하지 않는다. 세션/API 인증, Origin 검증, CSRF 방지, 역할별 파괴 작업 권한을 먼저 추가한다.
2. `yt-dlp` 큐를 SQLite에 영속화하고 동시성 제한, 재시작 복구, 다운로드 archive, 임시 파일의 원자적 완료 이동을 구현한다.
3. 저장 경로를 감지된 mount UUID의 하위 경로로 제한하고 symlink escape, 최소 여유 공간, read-only, 미마운트 상태를 매 작업 직전에 검사한다.
4. Transmission 자격 증명은 secret 파일 또는 systemd credential로 주입하고 API나 로그에서 반환하지 않는다.
5. worker를 전용 사용자로 실행하고 `NoNewPrivileges`, `ProtectSystem`, `ReadWritePaths`, CPU/IO/memory 제한을 적용한다.

## 수용 기준

- Magnet 추가 후 5초 안에 NexusPulse와 Transmission Remote GUI 양쪽에 같은 작업이 보인다.
- 설정 변경은 이후 새 작업에만 적용되며 기존 파일은 자동 이동하지 않는다.
- USB 미마운트, 읽기 전용, 권한 없음, 여유 공간 부족 시 새 작업을 차단하고 원인을 표시한다.
- 셸 메타문자가 포함된 URL도 셸로 해석되지 않는다. 실행은 `spawn`/`execFile` 인자 배열만 사용한다.
- worker 장애가 텔레메트리와 WebSocket 스트림을 중단하지 않는다.
