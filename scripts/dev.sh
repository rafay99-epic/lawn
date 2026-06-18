#!/usr/bin/env bash
#
# Start the local dev stack: this worktree's own anonymous local Convex backend
# + the Vite dev server. Used by `bun run dev` and by Conductor's Run button.
#
# Convex is started FIRST and we wait until it has pushed functions and written
# the local deployment URLs into .env.local. Only then do we boot Vite. If Vite
# starts before .env.local is finalized, Convex's write triggers a Vite restart
# mid dep-optimization and you get:
#   "chunk-XXXX.js does not exist in the optimize deps directory".
#
# Ports: Vite serves on $CONDUCTOR_PORT (so Conductor opens the right URL); the
# local Convex backend uses $CONDUCTOR_PORT+1 / +2. Outside Conductor it falls
# back to Vite :5296 and Convex's default ports.
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# Ensure this worktree's local deployment exists and is seeded (idempotent).
if ! bash scripts/convex-local-setup.sh; then
  echo "[dev] local Convex provisioning failed." >&2
  exit 1
fi

web_port="${CONDUCTOR_PORT:-5296}"
convex_flags=(--tail-logs disable)
if [ -n "${CONDUCTOR_PORT:-}" ]; then
  convex_flags=(
    --local-cloud-port "$((CONDUCTOR_PORT + 1))"
    --local-site-port "$((CONDUCTOR_PORT + 2))"
    "${convex_flags[@]}"
  )
fi

convex_log="$(mktemp)"
convex_pid=""
tail_pid=""
vite_pid=""
cleanup() {
  [ -n "$vite_pid" ] && kill "$vite_pid" 2>/dev/null
  [ -n "$tail_pid" ] && kill "$tail_pid" 2>/dev/null
  if [ -n "$convex_pid" ]; then
    pkill -P "$convex_pid" 2>/dev/null   # the local-backend binary (child of convex dev)
    kill "$convex_pid" 2>/dev/null
  fi
  rm -f "$convex_log"
}
trap 'cleanup; exit 0' INT TERM HUP
trap cleanup EXIT

echo "[dev] starting local Convex backend (writes the local URL into .env.local)..."
# CONVEX_DEPLOYMENT= keeps convex on the LOCAL deployment even if .env.local was
# copied in pointing at a cloud "dev:" deployment.
CONVEX_AGENT_MODE=anonymous CONVEX_DEPLOYMENT='' \
  bunx convex dev "${convex_flags[@]}" > "$convex_log" 2>&1 &
convex_pid=$!

# Wait until functions are pushed (so .env.local is final) before starting Vite.
convex_ready=0
for _ in $(seq 1 120); do
  if grep -q "Convex functions ready" "$convex_log" 2>/dev/null; then
    convex_ready=1
    break
  fi
  if ! kill -0 "$convex_pid" 2>/dev/null; then
    echo "[dev] Convex exited before becoming ready:" >&2
    sed 's/^/[convex] /' "$convex_log" >&2
    exit 1
  fi
  sleep 1
done

if [ "$convex_ready" -ne 1 ]; then
  echo "[dev] Convex did not become ready within 120 seconds:" >&2
  sed 's/^/[convex] /' "$convex_log" >&2
  exit 1
fi

# From here, stream Convex output to this terminal alongside Vite.
sed 's/^/[convex] /' "$convex_log"            # replay startup output
tail -n 0 -f "$convex_log" | sed 's/^/[convex] /' &
tail_pid=$!

echo "[dev] Convex ready. Starting Vite on :$web_port"
bunx vite dev --port "$web_port" &
vite_pid=$!
wait "$vite_pid"
