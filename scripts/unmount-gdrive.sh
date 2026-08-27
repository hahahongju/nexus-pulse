#!/usr/bin/env bash
MOUNT_POINT="/home/hongju/gdrive"

echo "Unmounting Google Drive from $MOUNT_POINT..."
fusermount3 -u "$MOUNT_POINT" 2>/dev/null || fusermount -u "$MOUNT_POINT" 2>/dev/null || true

if mountpoint -q "$MOUNT_POINT"; then
  echo "⚠️ Mount point is still busy. Trying lazy unmount..."
  fusermount3 -uz "$MOUNT_POINT" 2>/dev/null || true
fi

echo "✔ Google Drive unmounted successfully."
