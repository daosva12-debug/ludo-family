#!/usr/bin/env bash
# LUDO Family — local server + public Cloudflare tunnel
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
CF_BIN="${CLOUDFLARED_BIN:-}"
LOG_DIR="$ROOT/.arena-runtime"
mkdir -p "$LOG_DIR" "$ROOT/bin"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required"; exit 1
fi

if [ ! -d node_modules/express ]; then
  echo "Installing dependencies…"
  npm install
fi

if [ -z "$CF_BIN" ]; then
  for c in "$ROOT/bin/cloudflared" /tmp/cloudflared "$(command -v cloudflared 2>/dev/null || true)"; do
    if [ -n "${c:-}" ] && [ -x "$c" ]; then CF_BIN="$c"; break; fi
  done
fi
if [ -z "$CF_BIN" ]; then
  echo "Downloading cloudflared…"
  curl -sL -o "$ROOT/bin/cloudflared" \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$ROOT/bin/cloudflared"
  CF_BIN="$ROOT/bin/cloudflared"
fi

pkill -f "node server/index.js" 2>/dev/null || true
pkill -f "cloudflared tunnel --url" 2>/dev/null || true
sleep 1

echo "Starting LUDO Family on ${HOST}:${PORT}…"
# First boot without public URL; tunnel will fill public-config.json
node server/index.js >"$LOG_DIR/server.log" 2>&1 &
echo $! >"$LOG_DIR/server.pid"

ok=0
for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 0.25
done
if [ "$ok" != "1" ]; then
  echo "Server failed to start:"; tail -40 "$LOG_DIR/server.log" || true; exit 1
fi

echo "Opening public tunnel…"
: >"$LOG_DIR/tunnel.log"
"$CF_BIN" tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate \
  >"$LOG_DIR/tunnel.log" 2>&1 &
echo $! >"$LOG_DIR/tunnel.pid"

PUBLIC_URL=""
for i in $(seq 1 50); do
  PUBLIC_URL="$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" 2>/dev/null | head -1 || true)"
  if [ -n "$PUBLIC_URL" ]; then break; fi
  sleep 0.4
done

if [ -z "$PUBLIC_URL" ]; then
  echo "Could not detect tunnel URL. Log:"; tail -40 "$LOG_DIR/tunnel.log" || true
  exit 1
fi

cat > "$ROOT/public/public-config.json" <<EOF
{
  "publicBaseUrl": "${PUBLIC_URL}"
}
EOF
echo "$PUBLIC_URL" >"$LOG_DIR/public-url.txt"

# Restart server with PUBLIC_BASE_URL so process env + logs are consistent
kill "$(cat "$LOG_DIR/server.pid")" 2>/dev/null || true
sleep 0.6
PUBLIC_BASE_URL="$PUBLIC_URL" HOST="$HOST" PORT="$PORT" \
  node server/index.js >"$LOG_DIR/server.log" 2>&1 &
echo $! >"$LOG_DIR/server.pid"
sleep 0.8

# Verify public health
if curl -sf --max-time 20 "$PUBLIC_URL/api/health" >/dev/null 2>&1; then
  echo "Public health OK"
else
  echo "Warning: public health not reachable yet (DNS may need a few seconds)"
fi

echo ""
echo "=============================================="
echo "  LUDO Family — ONLINE listo"
echo "=============================================="
echo "  Enlace público (todos abren ESTE):"
echo "  $PUBLIC_URL"
echo ""
echo "  1) Abrí el enlace en PC y cada celular"
echo "  2) Uno: Crear sala online (nombre + color)"
echo "  3) Copiar invitación / Compartir"
echo "  4) Los demás: Unirse con código o enlace"
echo "=============================================="
echo "  Parar: npm run stop:online"
echo "=============================================="
