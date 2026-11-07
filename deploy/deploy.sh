#!/usr/bin/env bash
#
# Update ONE app server: pull the latest code, install, (migrate), build, and
# reload the app under PM2 without downtime. Run as the app user on a droplet:
#
#   cd /var/www/rowanhvac-app && bash deploy/deploy.sh
#
# Behind the load balancer, use deploy/digitalocean/deploy-all.sh instead: it
# runs this on every droplet in turn, with migrations on the first one only.
#
#   RUN_MIGRATIONS=0   skip database migrations (another server already ran them)

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/rowanhvac-app}"
cd "$APP_DIR"

echo "==> Pulling latest from git"
git pull --ff-only

echo "==> Installing dependencies"
npm ci

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "==> Applying database migrations"
  npx prisma migrate deploy
else
  echo "==> Skipping migrations (RUN_MIGRATIONS=0)"
  npx prisma generate
fi

echo "==> Building"
npm run build

echo "==> Reloading under PM2"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo "==> Done."
