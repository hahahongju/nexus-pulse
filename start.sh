#!/usr/bin/env bash

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${PORT:-4500}"

echo "============================================================"
echo "⚡ NexusPulse // Next-Gen Server Telemetry & Operations OS ⚡"
echo "============================================================"
echo "  • Directory: $DIR"
echo "  • Port:      $PORT"
echo "  • Node:      $(node -v 2>/dev/null || echo 'N/A')"
echo "============================================================"

# Check if client/dist exists, if not build it
if [ ! -d "$DIR/client/dist" ]; then
  echo "📦 Building client production assets..."
  npm --prefix "$DIR/client" run build
fi

echo "🚀 Starting NexusPulse Server on http://localhost:$PORT ..."
PORT=$PORT node "$DIR/server/index.js"
