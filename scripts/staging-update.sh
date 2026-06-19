#!/bin/sh
# Polls DockerHub for new staging images and redeploys if either has changed.
# Run via cron every minute. Logs to /var/log/rtdstats-update.log.

COMPOSE_FILE="/opt/rtdstats/deployment/docker-compose.staging.yml"
ENV_FILE="/opt/rtdstats/.env"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

BACKEND_IMAGE="immattic/rtdstats-backend:staging"
FRONTEND_IMAGE="immattic/rtdstats-frontend:staging"

digest_before() {
    docker inspect --format='{{index .RepoDigests 0}}' "$1" 2>/dev/null || echo "none"
}

git -C /opt/rtdstats pull --quiet

BACKEND_BEFORE=$(digest_before "$BACKEND_IMAGE")
FRONTEND_BEFORE=$(digest_before "$FRONTEND_IMAGE")

docker pull "$BACKEND_IMAGE" --quiet
docker pull "$FRONTEND_IMAGE" --quiet

BACKEND_AFTER=$(digest_before "$BACKEND_IMAGE")
FRONTEND_AFTER=$(digest_before "$FRONTEND_IMAGE")

CHANGED=0
[ "$BACKEND_BEFORE" != "$BACKEND_AFTER" ]  && CHANGED=1 && echo "$LOG_PREFIX Backend image updated."
[ "$FRONTEND_BEFORE" != "$FRONTEND_AFTER" ] && CHANGED=1 && echo "$LOG_PREFIX Frontend image updated."

if [ "$CHANGED" = "1" ]; then
    echo "$LOG_PREFIX Restarting app containers..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --pull never frontend backend
    echo "$LOG_PREFIX Done."
else
    echo "$LOG_PREFIX No changes."
fi
