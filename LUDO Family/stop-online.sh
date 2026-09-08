#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/.arena-runtime"
[ -f "$LOG_DIR/server.pid" ] && kill "$(cat "$LOG_DIR/server.pid")" 2>/dev/null || true
[ -f "$LOG_DIR/tunnel.pid" ] && kill "$(cat "$LOG_DIR/tunnel.pid")" 2>/dev/null || true
pkill -f "node server/index.js" 2>/dev/null || true
pkill -f "cloudflared tunnel --url" 2>/dev/null || true
echo "LUDO Family online stack stopped."
