#!/usr/bin/env bash
#
# One-shot deploy for a Linux server (Plesk over SSH, AWS, ...). Pulls the
# latest code and rebuilds/reloads the app (website + portal + van API, one
# app) under PM2. Safe to run repeatedly.
#
#   bash deploy/deploy.sh
#
# Assumes:
#   - repo cloned at /var/www/rowanhvac-app  (APP_DIR)
#   - .env present in APP_DIR (DATABASE_URL, AUTH_SECRET, …)
#   - node, npm, pm2 installed; MariaDB running

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/rowanhvac-app}"

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

echo "==> Done."
