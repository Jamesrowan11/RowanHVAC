#!/usr/bin/env bash
#
# Rolling update of every app droplet, one at a time, from your computer:
#
#   bash deploy/digitalocean/deploy-all.sh 203.0.113.10 203.0.113.11
#   (or: SERVERS="203.0.113.10 203.0.113.11" bash deploy/digitalocean/deploy-all.sh)
#
# Database migrations run on the first droplet only. Each droplet must be
# healthy again before the next one is updated, so the site stays up.

set -euo pipefail

HOSTS=("$@")
if [ ${#HOSTS[@]} -eq 0 ]; then
  read -r -a HOSTS <<< "${SERVERS:-}"
fi
if [ ${#HOSTS[@]} -eq 0 ]; then
  echo "usage: deploy-all.sh <droplet-ip> [<droplet-ip> ...]" >&2
  exit 1
fi

migrate=1
for host in "${HOSTS[@]}"; do
  echo "==================== $host ===================="
  ssh "root@$host" "su - rowan -c 'cd /var/www/rowanhvac-app && RUN_MIGRATIONS=$migrate bash deploy/deploy.sh'"
  echo "==> Waiting for $host to report healthy"
  ok=0
  for _ in $(seq 1 45); do
    if ssh "root@$host" "curl -fsS http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
  done
  if [ "$ok" != 1 ]; then
    echo "!! $host is not healthy; stopping here. Check: ssh root@$host 'su - rowan -c \"pm2 logs --lines 80\"'" >&2
    exit 1
  fi
  migrate=0
done
echo "==> All droplets updated."
