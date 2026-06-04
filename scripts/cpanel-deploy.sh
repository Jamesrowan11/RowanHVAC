#!/bin/bash
#
# cPanel deployment steps for Rowan Heating & Air Conditioning.
#
# Runs from the application root (where this repo is checked out and where the
# cPanel Node.js app's "Application Root" points). Invoked automatically by
# .cpanel.yml on each Git deployment, or run manually over SSH:
#
#     cd ~/rowanhvac && bash scripts/cpanel-deploy.sh
#
# Requires a .env file in the application root containing at least DATABASE_URL
# and AUTH_SECRET (Prisma and Next read it automatically). The .env file is NOT
# in version control — create it once on the server.

set -euo pipefail

# Move to the project root (parent of this script's directory).
cd "$(dirname "$0")/.."
APP_ROOT="$(pwd)"
echo "==> Deploying Rowan HVAC from ${APP_ROOT}"

# Use the cPanel-selected Node/npm if NodeJS Selector exposes them; otherwise
# fall back to whatever is on PATH.
echo "==> Node $(node -v 2>/dev/null || echo 'not found'), npm $(npm -v 2>/dev/null || echo 'not found')"

echo "==> Installing dependencies (incl. dev deps needed to build)"
npm ci --no-audit --no-fund

echo "==> Generating Prisma client"
npx prisma generate

echo "==> Applying database migrations"
npx prisma migrate deploy

echo "==> Building Next.js"
npm run build

# Persistent uploads directory (cPanel keeps the filesystem between deploys).
mkdir -p "${APP_ROOT}/uploads"

# Tell Passenger to restart the app so the new build is served.
mkdir -p "${APP_ROOT}/tmp"
touch "${APP_ROOT}/tmp/restart.txt"

echo "==> Deploy complete. Passenger will restart on the next request."
