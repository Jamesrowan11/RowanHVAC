#!/usr/bin/env bash
#
# Create the DNS for rowanheatingandair.com in DigitalOcean DNS: the domain,
# Zoho Mail's records (MX, SPF, DMARC, and verification/DKIM once Zoho gives
# them to you), and the website's A records once the load balancer exists.
# Safe to re-run: records that already exist are left alone.
#
# Needs doctl (DigitalOcean's CLI) logged in with an API token:
#   Ubuntu:  snap install doctl && doctl auth init
#   macOS:   brew install doctl && doctl auth init
#   (token: DigitalOcean → API → Generate New Token, read + write)
#
# Run in stages as you go through deploy/digitalocean/README.md:
#   bash deploy/digitalocean/dns.sh                       # domain + Zoho MX/SPF/DMARC
#   ZOHO_VERIFY="zoho-verification=zb12345678.zmverify.zoho.com" \
#   ZOHO_DKIM_SELECTOR="zmail" ZOHO_DKIM_VALUE="v=DKIM1; k=rsa; p=MIIB..." \
#     bash deploy/digitalocean/dns.sh                     # + Zoho verification and DKIM
#   LB_IP=203.0.113.50 bash deploy/digitalocean/dns.sh    # + website (load balancer)
#
# Options (environment variables):
#   DOMAIN        default rowanheatingandair.com
#   ZOHO_REGION   com (US, default) or eu: which Zoho data center your account is in
#   DMARC_EMAIL   where DMARC reports go (default info@DOMAIN)

set -euo pipefail

DOMAIN="${DOMAIN:-rowanheatingandair.com}"
ZOHO_REGION="${ZOHO_REGION:-com}"
DMARC_EMAIL="${DMARC_EMAIL:-info@$DOMAIN}"
TTL=3600

command -v doctl >/dev/null 2>&1 || { echo "doctl is not installed (see the top of this script)." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required." >&2; exit 1; }
doctl account get >/dev/null 2>&1 || { echo "doctl isn't logged in: run  doctl auth init" >&2; exit 1; }

if ! doctl compute domain get "$DOMAIN" >/dev/null 2>&1; then
  echo "==> Adding $DOMAIN to DigitalOcean DNS"
  doctl compute domain create "$DOMAIN" >/dev/null
fi

existing_json() {
  doctl compute domain records list "$DOMAIN" --output json
}

# lookup TYPE NAME -> prints existing data values (normalized), one per line
lookup() {
  existing_json | python3 -c '
import json, sys
t, n = sys.argv[1], sys.argv[2]
for r in json.load(sys.stdin) or []:
    if r.get("type") == t and r.get("name") == n:
        print(str(r.get("data", "")).strip("\"").rstrip(".").lower())
' "$1" "$2"
}

norm() { printf '%s' "$1" | sed 's/^"//; s/"$//; s/\.$//' | tr '[:upper:]' '[:lower:]'; }

# ensure TYPE NAME DATA [PRIORITY]
ensure() {
  local type="$1" name="$2" data="$3" prio="${4:-}"
  local want; want="$(norm "$data")"
  if lookup "$type" "$name" | grep -Fxq -- "$want"; then
    echo "   ok      $type $name $data"
    return
  fi
  local args=(compute domain records create "$DOMAIN" --record-type "$type" --record-name "$name"
              --record-data "$data" --record-ttl "$TTL")
  [ -n "$prio" ] && args+=(--record-priority "$prio")
  doctl "${args[@]}" >/dev/null
  echo "   added   $type $name $data${prio:+ (priority $prio)}"
}

echo "==> Zoho Mail ($ZOHO_REGION data center)"
ensure MX @ "mx.zoho.$ZOHO_REGION." 10
ensure MX @ "mx2.zoho.$ZOHO_REGION." 20
ensure MX @ "mx3.zoho.$ZOHO_REGION." 50

# Exactly one SPF record is allowed; never add a second one.
SPF="v=spf1 include:zoho.$ZOHO_REGION ~all"
current_spf="$(lookup TXT @ | grep '^v=spf1' || true)"
if [ -z "$current_spf" ]; then
  ensure TXT @ "$SPF"
elif [ "$current_spf" = "$(norm "$SPF")" ]; then
  echo "   ok      TXT @ $SPF"
else
  echo "   CHECK   an SPF record already exists: \"$current_spf\""
  echo "           It must include zoho.$ZOHO_REGION. Edit it in DigitalOcean → Networking → Domains."
fi

if [ -z "$(lookup TXT _dmarc)" ]; then
  ensure TXT _dmarc "v=DMARC1; p=none; rua=mailto:$DMARC_EMAIL"
else
  echo "   ok      TXT _dmarc (already set)"
fi

if [ -n "${ZOHO_VERIFY:-}" ]; then
  ensure TXT @ "$ZOHO_VERIFY"
else
  echo "   later   Zoho verification TXT: rerun with ZOHO_VERIFY=\"zoho-verification=...\""
fi
if [ -n "${ZOHO_DKIM_SELECTOR:-}" ] && [ -n "${ZOHO_DKIM_VALUE:-}" ]; then
  ensure TXT "${ZOHO_DKIM_SELECTOR}._domainkey" "$ZOHO_DKIM_VALUE"
else
  echo "   later   Zoho DKIM TXT: rerun with ZOHO_DKIM_SELECTOR and ZOHO_DKIM_VALUE"
fi

echo "==> Website"
if [ -n "${LB_IP:-}" ]; then
  for name in @ www; do
    current="$(lookup A "$name")"
    if [ -n "$current" ] && ! printf '%s\n' "$current" | grep -Fxq "$LB_IP"; then
      echo "   CHECK   A $name already points to $(echo "$current" | tr '\n' ' ')- change it to $LB_IP in the control panel"
    else
      ensure A "$name" "$LB_IP"
    fi
  done
else
  echo "   later   A @ and A www → load balancer: rerun with LB_IP=<load balancer IP>"
fi

cat <<MSG

==> At your domain registrar, set the nameservers for $DOMAIN to:
      ns1.digitalocean.com
      ns2.digitalocean.com
      ns3.digitalocean.com
    (Check progress:  dig +short NS $DOMAIN   or   https://dnschecker.org)
MSG
