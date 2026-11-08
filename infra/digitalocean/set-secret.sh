#!/usr/bin/env bash
# Set a secret in /etc/rowanhvac/env without it ever touching Git or the screen.
#   sudo rowanhvac-secret ZEPTOMAIL_TOKEN
# (DigitalOcean dashboard -> the droplet -> Access -> Launch Droplet Console)
set -euo pipefail
APP=rowanhvac
ENV_FILE=/etc/$APP/env
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
name=${1:-}
[[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "Usage: sudo $APP-secret NAME   (e.g. ZEPTOMAIL_TOKEN)" >&2; exit 1; }
read -r -s -p "Paste the value for $name, then press Enter: " value; echo
[ -n "$value" ] || { echo "Nothing entered; unchanged." >&2; exit 1; }
[[ "$value" != *$'\n'* ]] || { echo "The value must be one line." >&2; exit 1; }
tmp=$(mktemp); grep -v "^$name=" "$ENV_FILE" > "$tmp" || true
printf '%s=%s\n' "$name" "$value" >> "$tmp"
install -o root -g $APP -m 640 "$tmp" "$ENV_FILE"; rm -f "$tmp"
systemctl restart $APP
echo "Saved $name and restarted $APP."
