# VM 콘솔 SSL 인증서

NexusPulse는 Tailscale Serve의 `https://homeserver.tail9e8705.ts.net:8444`에서
서비스되며, VM 콘솔은 같은 호스트의 Cockpit `9090` 포트로 연결된다.
Cockpit의 기본 자체 서명 인증서를 Tailscale이 관리하는 동일 도메인의 인증서로 교체한다.

서버 터미널에서 관리자 권한으로 한 번 실행한다:

```bash
sudo bash /mnt/workspace/server-management/nexus-pulse/scripts/setup-cockpit-tls.sh
```

스크립트는 Tailscale 인증서와 키를 가져와 호스트명·만료·키 일치를 검사하고
`/etc/cockpit/ws-certs.d/99-nexuspulse-tailscale.cert` 및 `.key`에 설치한다.
개인 키는 root만 읽을 수 있다. 인증서가 바뀌면 Cockpit 서비스를 재시작하므로
열려 있는 콘솔은 재접속이 필요할 수 있다. 실행 중인 VM에는 영향을 주지 않는다.
HTTPS 신뢰 검증과 실제 제공 인증서 비교가 성공하면 일일 갱신 타이머를 설치한다.
갱신 실행 파일은 root 소유 `/usr/local/sbin/nexuspulse-cockpit-tls`에 복사한다.

```bash
systemctl status nexuspulse-cockpit-tls.timer
journalctl -u nexuspulse-cockpit-tls.service
curl -I https://homeserver.tail9e8705.ts.net:9090/
```

인증서는 DNS 이름에 발급되므로 NexusPulse와 콘솔 모두 위 도메인으로 접속한다.
IP 주소 또는 localhost로 접속하면 인증서 이름 불일치가 발생한다.
기존 자체 서명 파일은 보존되며, 재갱신 시 직전 설치 파일은 `.previous`로 보관된다.

설정 기준: [Cockpit SSL/TLS 공식 문서](https://cockpit-project.org/guide/latest/https.html).
