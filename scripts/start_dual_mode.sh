#!/usr/bin/env bash
# Starts two fully isolated BiteWise instances side by side:
#   - LIVE instance (existing .env / frontend/.env.local, unchanged) — :8000 / :3000
#   - DEMO instance (USE_MOCK_MCP=true, separate DB, separate ports) — :8001 / :3001
#
# Built for recording a walkthrough that cuts between both without
# restarting servers mid-take. See the plan this was built from for the
# reasoning behind each env var override.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Starting LIVE instance (existing .env, unchanged)..."
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 \
  > /tmp/bitewise-live-backend.log 2>&1 &
disown

(cd frontend && npm run dev -- -p 3000) > /tmp/bitewise-live-frontend.log 2>&1 &
disown

echo "Starting DEMO instance (mock mode, isolated DB, :8001/:3001)..."
USE_MOCK_MCP=true \
SWIGGY_ENV=mock \
DATABASE_URL=sqlite:///./nutriorder_demo.db \
CORS_ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001 \
FRONTEND_BASE_URL=http://localhost:3001 \
SWIGGY_REDIRECT_URI=http://localhost:8001/auth/swiggy/callback \
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001 \
  > /tmp/bitewise-demo-backend.log 2>&1 &
disown

(cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8001 NEXT_DIST_DIR=.next-demo \
  npm run dev -- -p 3001) > /tmp/bitewise-demo-frontend.log 2>&1 &
disown

echo "Waiting for all four to come up..."
sleep 5

check() {
  local url="$1" label="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
  if [ "$code" = "200" ]; then
    echo "  OK   $label ($url)"
  else
    echo "  FAIL $label ($url) -> HTTP $code — check its log in /tmp/bitewise-*.log"
  fi
}

echo ""
echo "Health checks:"
check "http://localhost:8000/health" "live backend"
check "http://localhost:3000"        "live frontend"
check "http://localhost:8001/health" "demo backend"
check "http://localhost:3001"        "demo frontend"

cat <<'EOF'

  ─────────────────────────────────────────────
  LIVE mode  -> http://localhost:3000   (real Swiggy account)
  DEMO mode  -> http://localhost:3001   (mock data — click "Try Sandbox
                                          Demo", then "Load Demo Data")
  ─────────────────────────────────────────────
  Logs: /tmp/bitewise-{live,demo}-{backend,frontend}.log
  Stop: scripts/stop_dual_mode.sh
EOF
