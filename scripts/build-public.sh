#!/bin/bash
#
# Build the public marketing site (rowanhvac.rowancopy.com) as static files.
#
# Produces public-site/out/ — a folder of plain HTML/CSS/JS that runs on any
# GoDaddy plan with no Node process. Copy its contents to the document root of
# the rowanhvac.rowancopy.com subdomain.
#
# Optionally set PUBLIC_DEPLOY_PATH to have this script copy the output there
# automatically, e.g.:
#   PUBLIC_DEPLOY_PATH=/home/youruser/rowanhvac.rowancopy.com bash scripts/build-public.sh
#
# The portal URL the static form/login point at can be overridden with
# NEXT_PUBLIC_PORTAL_URL (defaults to https://rowanhvacportal.rowancopy.com).

set -euo pipefail

cd "$(dirname "$0")/../public-site"

export NEXT_PUBLIC_PORTAL_URL="${NEXT_PUBLIC_PORTAL_URL:-https://rowanhvacportal.rowancopy.com}"
export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://rowanhvac.rowancopy.com}"

echo "==> Building public site (portal: ${NEXT_PUBLIC_PORTAL_URL})"
npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
npm run build

OUT="$(pwd)/out"
echo "==> Static site built at: ${OUT}"

if [ -n "${PUBLIC_DEPLOY_PATH:-}" ]; then
  echo "==> Copying to ${PUBLIC_DEPLOY_PATH}"
  mkdir -p "${PUBLIC_DEPLOY_PATH}"
  # Mirror the export into the subdomain document root.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${OUT}/" "${PUBLIC_DEPLOY_PATH}/"
  else
    rm -rf "${PUBLIC_DEPLOY_PATH:?}/"* 2>/dev/null || true
    cp -R "${OUT}/." "${PUBLIC_DEPLOY_PATH}/"
  fi
  echo "==> Public site deployed to ${PUBLIC_DEPLOY_PATH}"
else
  echo "==> Set PUBLIC_DEPLOY_PATH to auto-copy, or upload the contents of"
  echo "    ${OUT} to the rowanhvac.rowancopy.com document root."
fi
