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
- YouTube JavaScript challenge 처리를 위한 Node runtime과 공식 `yt-dlp/ejs` solver 사용
- 13인치 이하 태블릿 기본 프리셋: 최대 720p, H.264 영상, M4A 오디오, MP4 출력
- 요청별 화질 선택: 360p, 480p, 720p(기본), 1080p, 최고 화질, MP3 192K
- 파일명 형식: 읽을 수 있는 원본 한글 제목과 YouTube 영상 ID (`제목 [ID].mp4`)
- YouTube 작업 동시 실행 기본값 2개 (`YOUTUBE_CONCURRENCY`로 변경 가능)
- 완료 작업은 큐 화면에서 자동으로 숨기고 MP4 파일만 저장 폴더에 유지
- 웹 자연어 요청: 제한된 Hermes(`web,nexus_downloads`)를 통해 검색 후 큐 등록
- Linux 물리 마운트 탐지와 용량/여유 공간 표시
- 기본 저장 디렉터리 설정 및 쓰기 가능 여부 진단
- 다운로드 실행 도구 설치 여부와 Transmission RPC 연결 상태 표시
- 데스크톱/모바일 대응 Downloads 탭

설정은 기본적으로 `data/downloads.json`에 mode `0600`으로 기록되며 Git에 포함되지 않는다. `NEXUSPULSE_CONFIG_DIR`과 `DOWNLOAD_DIR` 환경변수로 위치를 바꿀 수 있다.

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

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/downloads/status` | 도구, 설정, 마운트 상태 |
| `POST` | `/api/downloads/request` | Hermes 자연어 다운로드 요청 |
| `PUT` | `/api/downloads/settings` | 기본 저장 경로 변경 |
| `GET` | `/api/downloads/transmission` | Torrent 큐 조회 |
| `POST` | `/api/downloads/transmission` | Magnet/torrent URL 추가 |
| `POST` | `/api/downloads/transmission/:id/:action` | `start`, `stop`, `remove`, `delete` |
| `GET` | `/api/downloads/youtube` | YouTube 작업 조회 |
| `POST` | `/api/downloads/youtube` | YouTube URL 작업 시작 |
| `POST` | `/api/downloads/youtube/:id/:action` | `pause`, `resume`, `cancel`, `remove`, `delete` |

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
