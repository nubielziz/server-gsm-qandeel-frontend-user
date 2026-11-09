#!/usr/bin/env bash
# Runs an isolated, demo-seeded copy of the GSM backend for storefront development: API on :3100, worker metrics on :9465.
# It never touches the owner's API on :3000 or its data: it has its own database, Redis databases and files bucket.
# Usage: scripts/dev-backend.sh bucket|reset|start|stop|status   (reset = drop + migrate + demo seed of gsm_storefront only)
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-$(cd "$(dirname "$0")/../../backend" && pwd)}"
LOG_DIR="${LOG_DIR:-${TMPDIR:-/tmp}/gsm-storefront-backend}"
mkdir -p "$LOG_DIR"

export NODE_ENV=development
export PORT=3100
export WORKER_METRICS_PORT=9465
export DATABASE_URL=postgres://gsm:gsm@localhost:5432/gsm_storefront
export REDIS_QUEUE_URL=redis://localhost:6379/5
export REDIS_CACHE_URL=redis://localhost:6380/5
export S3_BUCKET=gsm-files-storefront
# :5175 = next dev, :5176 = next start (production build checks).
export CORS_ORIGINS=http://localhost:5175,http://127.0.0.1:5175,http://localhost:5176
export STORE_BASE_URL=http://localhost:5175
export PORTAL_BASE_URL=http://localhost:5175/merchant
# Every mail goes to Mailpit (http://localhost:8025), never to Resend.
export MAIL_SMTP_URL=smtp://localhost:1025

# Public MinIO dev credentials (backend/src/config/env.ts DEV_DEFAULTS).
S3_USER="${S3_ACCESS_KEY_ID:-gsm-minio}"
S3_PASS="${S3_SECRET_ACCESS_KEY:-gsm-minio-secret}"

pid_of() { cat "$LOG_DIR/$1.pid" 2>/dev/null || true; }
alive() { local p; p=$(pid_of "$1"); [[ -n "$p" ]] && kill -0 "$p" 2>/dev/null; }

case "${1:-status}" in
  bucket)
    code=$(curl -s -o /dev/null -w '%{http_code}' --aws-sigv4 "aws:amz:us-east-1:s3" --user "$S3_USER:$S3_PASS" \
      -X PUT "http://localhost:9000/$S3_BUCKET")
    echo "create bucket $S3_BUCKET: HTTP $code (200 = created, 409 = already there)"
    ;;
  reset)
    if alive api || alive worker; then echo "stop the isolated API and worker first: $0 stop" >&2; exit 1; fi
    (cd "$BACKEND_DIR" && bun run db:reset --seed)
    ;;
  start)
    alive api || { (cd "$BACKEND_DIR" && setsid nohup bun src/main.ts >"$LOG_DIR/api.log" 2>&1 & echo $! >"$LOG_DIR/api.pid"); }
    alive worker || { (cd "$BACKEND_DIR" && setsid nohup bun src/worker.ts >"$LOG_DIR/worker.log" 2>&1 & echo $! >"$LOG_DIR/worker.pid"); }
    for _ in $(seq 1 60); do
      [[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/health)" == "200" ]] && { echo "API up on :3100 (logs: $LOG_DIR)"; exit 0; }
      sleep 1
    done
    echo "API did not answer /health within 60 s; see $LOG_DIR/api.log" >&2; exit 1
    ;;
  stop)
    for name in api worker; do
      if alive "$name"; then kill "$(pid_of "$name")" && echo "stopped $name"; fi
      rm -f "$LOG_DIR/$name.pid"
    done
    ;;
  status)
    for name in api worker; do
      if alive "$name"; then echo "$name: running (pid $(pid_of "$name"))"; else echo "$name: stopped"; fi
    done
    echo "health: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/health)"
    ;;
  *)
    echo "usage: $0 bucket|reset|start|stop|status" >&2; exit 2
    ;;
esac
