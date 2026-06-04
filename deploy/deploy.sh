#!/usr/bin/env bash
#
# One-shot deploy for a Linux server (AWS EC2 / Lightsail).
# Pulls latest, rebuilds the portal, reloads it under PM2, and republishes the
# static public site. Safe to run repeatedly.
#
#   bash deploy/deploy.sh
#
# Assumes:
#   - repo cloned at /var/www/rowanhvac-app  (APP_DIR)
#   - public site served from /var/www/rowanhvac-public  (PUBLIC_DIR)
#   - .env present in APP_DIR (DATABASE_URL, AUTH_SECRET, …)
#   - node, npm, pm2 installed; MariaDB running

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/rowanhvac-app}"
PUBLIC_DIR="${PUBLIC_DIR:-/var/www/rowanhvac-public}"
PORTAL_URL="${NEXT_PUBLIC_PORTAL_URL:-https://rowanhvacportal.rowancopy.com}"
SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://rowanhvac.rowancopy.com}"

cd "$APP_DIR"
echo "==> Pulling latest from git"
git pull --ff-only

echo "==> Installing portal dependencies"
npm ci

echo "==> Applying database migrations"
npx prisma migrate deploy

echo "==> Building portal"
npm run build

echo "==> Reloading portal under PM2"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo "==> Building & publishing the static public site"
mkdir -p "$PUBLIC_DIR"
PUBLIC_DEPLOY_PATH="$PUBLIC_DIR" \
  NEXT_PUBLIC_PORTAL_URL="$PORTAL_URL" \
  NEXT_PUBLIC_SITE_URL="$SITE_URL" \
  node scripts/deploy-public.mjs

echo "==> Done."
