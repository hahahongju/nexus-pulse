#!/usr/bin/env bash
# Share the certificate managed by Tailscale Serve with the Cockpit VM console.
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

domain=homeserver.tail9e8705.ts.net
cert_dir=/etc/cockpit/ws-certs.d
cert_name=99-nexuspulse-tailscale
installed_script=/usr/local/sbin/nexuspulse-cockpit-tls

if (( EUID != 0 )); then
  echo 'Run this script with sudo to install the Cockpit certificate and renewal timer.' >&2
  exit 1
fi
if [[ ${1:-} != '' && ${1:-} != --sync ]]; then
  echo 'Usage: setup-cockpit-tls.sh [--sync]' >&2
  exit 1
fi

exec 9>/run/lock/nexuspulse-cockpit-tls.lock
flock -n 9
work_dir=$(mktemp -d /run/nexuspulse-cockpit-tls.XXXXXX)
trap 'rm -rf -- "$work_dir"' EXIT

# tailscaled supplies its cached certificate, also used by NexusPulse HTTPS.
tailscale cert --cert-file "$work_dir/server.cert" --key-file "$work_dir/server.key" "$domain"
openssl x509 -in "$work_dir/server.cert" -noout -checkhost "$domain"
openssl x509 -in "$work_dir/server.cert" -noout -checkend 0
openssl x509 -in "$work_dir/server.cert" -pubkey -noout > "$work_dir/cert.pub"
openssl pkey -in "$work_dir/server.key" -pubout > "$work_dir/key.pub"
cmp "$work_dir/cert.pub" "$work_dir/key.pub"

install -d -o root -g root -m 0755 "$cert_dir"
if ! cmp -s "$work_dir/server.cert" "$cert_dir/$cert_name.cert" ||
   ! cmp -s "$work_dir/server.key" "$cert_dir/$cert_name.key"; then
  # Keep the former pair for recovery, including on renewal.
  for ext in cert key; do
    if [[ -f "$cert_dir/$cert_name.$ext" ]]; then
      install -o root -g root -m 0600 "$cert_dir/$cert_name.$ext" "$cert_dir/$cert_name.$ext.previous"
    fi
  done
  install -o root -g root -m 0600 "$work_dir/server.key" "$cert_dir/$cert_name.key"
  install -o root -g root -m 0644 "$work_dir/server.cert" "$cert_dir/$cert_name.cert"
  /usr/lib/cockpit/cockpit-certificate-ensure --check
  systemctl restart cockpit.service
fi

# Verify trust, hostname, and the certificate actually served on port 9090.
curl --fail --silent --show-error --max-time 15 \
  --resolve "$domain:9090:127.0.0.1" "https://$domain:9090/" -o /dev/null
timeout 15 openssl s_client -connect 127.0.0.1:9090 -servername "$domain" \
  </dev/null 2>/dev/null | openssl x509 -outform DER > "$work_dir/served.der"
openssl x509 -in "$work_dir/server.cert" -outform DER > "$work_dir/expected.der"
cmp "$work_dir/served.der" "$work_dir/expected.der"

if [[ ${1:-} != --sync ]]; then
  install -o root -g root -m 0755 "$(readlink -f "$0")" "$installed_script"
  cat > /etc/systemd/system/nexuspulse-cockpit-tls.service <<'UNIT'
[Unit]
Description=Synchronize NexusPulse Tailscale certificate to Cockpit
Wants=network-online.target
After=network-online.target tailscaled.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/nexuspulse-cockpit-tls --sync
UMask=0077
UNIT
  cat > /etc/systemd/system/nexuspulse-cockpit-tls.timer <<'UNIT'
[Unit]
Description=Refresh Cockpit Tailscale certificate daily

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now nexuspulse-cockpit-tls.timer
fi
echo "Cockpit TLS verified: https://$domain:9090/"
