#!/usr/bin/env bash
#
# Prepare a fresh Ubuntu 22.04 / 24.04 droplet to run Rowan HVAC behind the
# DigitalOcean Load Balancer. Run once per droplet, as root:
#
#   curl -fsSL https://raw.githubusercontent.com/Jamesrowan11/RowanHVAC/main/deploy/digitalocean/setup-droplet.sh -o setup-droplet.sh
#   bash setup-droplet.sh            (or: BRANCH=claude/epic-bell-jg2dxs bash setup-droplet.sh)
#
# Installs Node.js 20, PM2, nginx and git; creates the "rowan" app user;
# clones the code to /var/www/rowanhvac-app; sets up nginx and PM2-on-boot.
# Safe to run again.

set -euo pipefail

APP_USER="${APP_USER:-rowan}"
APP_DIR="${APP_DIR:-/var/www/rowanhvac-app}"
REPO_URL="${REPO_URL:-https://github.com/Jamesrowan11/RowanHVAC.git}"
BRANCH="${BRANCH:-main}"

echo "==> System packages"
apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -y -q ca-certificates curl git nginx

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20\.'; then
  echo "==> Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -q nodejs
fi
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# Building Next.js needs ~2 GB of memory; add swap on small droplets.
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 3000 ] && ! swapon --show | grep -q /swapfile; then
  echo "==> 2 GB swap file"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> App user and folders"
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$APP_USER"
mkdir -p "$APP_DIR" /etc/rowanhvac
chown "$APP_USER:$APP_USER" "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "==> Cloning $REPO_URL ($BRANCH)"
  if ! sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"; then
    echo
    echo "Clone failed. If the repository is private, as $APP_USER run:"
    echo "  ssh-keygen -t ed25519   (add ~/.ssh/id_ed25519.pub in GitHub → repo → Settings → Deploy keys)"
    echo "  git clone --branch $BRANCH git@github.com:Jamesrowan11/RowanHVAC.git $APP_DIR"
    echo "then run this script again."
    exit 1
  fi
fi

echo "==> nginx"
cp "$APP_DIR/deploy/digitalocean/nginx-rowanhvac.conf" /etc/nginx/sites-available/rowanhvac.conf
ln -sf /etc/nginx/sites-available/rowanhvac.conf /etc/nginx/sites-enabled/rowanhvac.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl reload nginx

echo "==> PM2 starts the app on boot (as $APP_USER)"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null

cat <<MSG

Droplet ready. Next (see deploy/digitalocean/README.md):
  1. Put the database CA certificate at /etc/rowanhvac/ca-certificate.crt
  2. Put the shared .env at $APP_DIR/.env (same file on every droplet)
  3. su - $APP_USER -c "cd $APP_DIR && npm ci && npm run build && pm2 start ecosystem.config.js && pm2 save"
MSG
