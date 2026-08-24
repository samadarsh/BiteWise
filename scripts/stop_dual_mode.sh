#!/usr/bin/env bash
# Stops all four processes started by start_dual_mode.sh.

for port in 8000 3000 8001 3001; do
  pids=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Stopping port $port (pid: $pids)"
    kill $pids 2>/dev/null || true
  else
    echo "Port $port not in use"
  fi
done
