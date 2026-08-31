#!/bin/sh
# Redeploy the RTD Stats staging stack when either the Docker Hub :staging
# images OR the git checkout changes.
#
# Cron (every minute):
#   * * * * * /opt/rtdstats/scripts/staging-update.sh >> /var/log/rtdstats-update.log 2>&1
#
# Why the git handling matters: gtfs-static/ is bind-mounted into the backend
# (not baked into the image) and the backend caches those CSVs in memory for the
# life of the process. A `git pull` that refreshes the feeds changes neither an
# image digest nor the Compose config, so `docker compose up -d` alone will NOT
# pick it up -- the backend keeps serving stale routes (e.g. commuter rail shows
# the raw route_id "113B" instead of "B"). This script force-recreates the
# backend whenever gtfs-static/ changes.

set -eu

# Serialise overlapping cron runs -- a deploy can outlast the 1-minute interval.
if [ "${RTDSTATS_LOCKED:-}" != "1" ] && command -v flock >/dev/null 2>&1; then
    RTDSTATS_LOCKED=1
    export RTDSTATS_LOCKED
    exec flock -n /tmp/rtdstats-update.lock "$0" "$@"
fi

# cron runs with a minimal PATH; docker / git may not be on it.
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

REPO="/opt/rtdstats"
COMPOSE_FILE="$REPO/deployment/docker-compose.staging.yml"
ENV_FILE="$REPO/deployment/.env"
BACKEND_IMAGE="aggiematt/rtdstats-backend:staging"
FRONTEND_IMAGE="aggiematt/rtdstats-frontend:staging"
HEALTH_URL="http://127.0.0.1:8000/api/v1/realtime/vehicles"

log()    { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
dc()     { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }
digest() { docker inspect --format='{{index .RepoDigests 0}}' "$1" 2>/dev/null || echo none; }

# ── 1. Sync the checkout (fast-forward only; surface drift loudly) ─────────
GIT_BEFORE=$(git -C "$REPO" rev-parse HEAD)
if ! git -C "$REPO" pull --ff-only --quiet; then
    log "ERROR: 'git -C $REPO pull --ff-only' failed -- checkout has diverged or"
    log "       has local edits to tracked files. NOTHING deployed."
    log "       Fix on the VM:  git -C $REPO status   (then stash/reset, or"
    log "       'git -C $REPO reset --hard @{u}' to make it a strict mirror)."
    exit 1
fi
GIT_AFTER=$(git -C "$REPO" rev-parse HEAD)

REPO_CHANGED=0
GTFS_CHANGED=0
if [ "$GIT_BEFORE" != "$GIT_AFTER" ]; then
    REPO_CHANGED=1
    log "Checkout $(git -C "$REPO" rev-parse --short "$GIT_BEFORE") -> $(git -C "$REPO" rev-parse --short "$GIT_AFTER"); changed files:"
    git -C "$REPO" diff --name-only "$GIT_BEFORE" "$GIT_AFTER" | sed 's/^/  /'
    if [ -n "$(git -C "$REPO" diff --name-only "$GIT_BEFORE" "$GIT_AFTER" -- gtfs-static)" ]; then
        GTFS_CHANGED=1
    fi
fi

# ── 2. Pull images, note which digests moved ─────────────────────────────
B_BEFORE=$(digest "$BACKEND_IMAGE");  F_BEFORE=$(digest "$FRONTEND_IMAGE")
docker pull --quiet "$BACKEND_IMAGE"  >/dev/null 2>&1 || log "WARN: docker pull $BACKEND_IMAGE failed"
docker pull --quiet "$FRONTEND_IMAGE" >/dev/null 2>&1 || log "WARN: docker pull $FRONTEND_IMAGE failed"
B_AFTER=$(digest "$BACKEND_IMAGE");   F_AFTER=$(digest "$FRONTEND_IMAGE")

BACKEND_IMG_CHANGED=0
if [ "$B_BEFORE" != "$B_AFTER" ]; then BACKEND_IMG_CHANGED=1; log "Backend image updated."; fi
FRONTEND_IMG_CHANGED=0
if [ "$F_BEFORE" != "$F_AFTER" ]; then FRONTEND_IMG_CHANGED=1; log "Frontend image updated."; fi

# ── 3. Deploy only if something actually changed ─────────────────────────
if [ "${REPO_CHANGED}${BACKEND_IMG_CHANGED}${FRONTEND_IMG_CHANGED}" = "000" ]; then
    log "No changes."
    exit 0
fi

log "Reconciling stack..."
if ! dc up -d --no-deps --pull never db frontend backend; then
    log "ERROR: 'docker compose up' failed."
    exit 1
fi

# A gtfs-static refresh with no new backend image is invisible to the reconcile
# above (bind mount + in-process cache), so the running backend must be told to
# restart and reload the feeds.
if [ "$GTFS_CHANGED" = "1" ] && [ "$BACKEND_IMG_CHANGED" = "0" ]; then
    log "gtfs-static changed without a backend image bump -> force-recreating backend."
    dc up -d --no-deps --force-recreate backend
fi

# ── 4. Smoke-test: the endpoint that breaks when routes don't resolve ────
i=0
while [ "$i" -lt 30 ]; do
    if wget -q -T 5 -O /dev/null "$HEALTH_URL" 2>/dev/null; then
        log "Backend healthy. Done."
        exit 0
    fi
    i=$((i + 1))
    sleep 2
done
log "WARN: backend did not answer $HEALTH_URL within 60s after deploy."
