#!/usr/bin/env bash
set -e

MOUNT_POINT="/home/hongju/gdrive"
CONFIG_FILE="/home/hongju/.config/rclone/rclone.conf"

mkdir -p "$MOUNT_POINT"

echo "=========================================================="
echo "🌐 NexusPulse - Google Drive Cloud Storage Mount Engine"
echo "=========================================================="

if [ ! -f "$CONFIG_FILE" ] || ! grep -q "\[gdrive\]" "$CONFIG_FILE"; then
  echo "⚠️  Google Drive remote 'gdrive' is not configured yet."
  echo ""
  echo "👉 Please run 'rclone config' in your terminal and create a remote named 'gdrive':"
  echo "   1) Type 'n' (New remote)"
  echo "   2) Name: gdrive"
  echo "   3) Storage: drive (Google Drive)"
  echo "   4) Scope: 1 (Full access)"
  echo "   5) Follow the on-screen browser authorization link"
  echo ""
  exit 1
fi

# Check if already mounted
if mountpoint -q "$MOUNT_POINT"; then
  echo "✔ Google Drive is already mounted at: $MOUNT_POINT"
  df -h "$MOUNT_POINT"
  exit 0
fi

echo "Mounting Google Drive to $MOUNT_POINT with High-Performance VFS Cache..."
rclone mount gdrive: "$MOUNT_POINT" \
  --vfs-cache-mode full \
  --vfs-cache-max-size 10G \
  --vfs-read-chunk-size 32M \
  --buffer-size 32M \
  --allow-other \
  --daemon

sleep 1

if mountpoint -q "$MOUNT_POINT"; then
  echo "🎉 Google Drive mounted successfully at: $MOUNT_POINT"
  df -h "$MOUNT_POINT"
else
  echo "❌ Mount verification failed. Check rclone logs."
  exit 1
fi
