# Deploying on DigitalOcean (droplets behind a Load Balancer)

No control panel: plain Ubuntu droplets, a DigitalOcean **Load Balancer** in
front, and managed services for anything that must be shared between them.

```
                 rowanheatingandair.com  (DNS at DigitalOcean)
                              │
                ┌─────────────▼──────────────┐
  customers,    │  DigitalOcean Load Balancer │  HTTPS (Let's Encrypt), HTTP→HTTPS,
  office, vans ─►  health check /api/health   │  sticky sessions
                └──────┬─────────┬─────────┬──┘
                 HTTP :80  HTTP :80  HTTP :80       (private network / VPC)
          ┌────────▼──┐ ┌────▼──────┐ ┌▼──────────┐
          │ droplet 1 │ │ droplet 2 │ │ droplet 3 │  Ubuntu · nginx · Node 20 · PM2
          │ app (x2)  │ │ app (x2)  │ │ app (x2)  │  same code, same .env
          └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                └─────────────┼─────────────┘
          ┌──────────────┬────┴─────────┬───────────────────────┐
  ┌───────▼───────┐ ┌────▼─────────┐ ┌──▼───────────────────┐
  │ Managed MySQL │ │   Spaces     │ │ Zoho Mail (SMTP/IMAP)│
  │  (database)   │ │ (files, PDFs)│ │ mailboxes + webmail  │
  └───────────────┘ └──────────────┘ └──────────────────────┘
```

Why each piece: every droplet must see the same data, so the **database**
is a Managed MySQL cluster, **uploaded files** (customer documents, equipment
manuals) live in **Spaces**, and sessions are signed with the same secret on
every droplet. Email (company mailboxes, webmail, and the website's automatic
emails) is **Zoho Mail**.

Do everything in **one region** (e.g. NYC3) so the droplets, database, Spaces
and load balancer share a private network.

**Starting from scratch** (no old server to copy from): follow steps 1–9 in
order. You'll begin with an empty site, create your own admin account in
step 7, and add staff, customers and manuals from the portal. Old mailboxes
can't be recovered without the old server, so Zoho starts fresh too.

**Who controls the domain:** if `rowanheatingandair.com`'s DNS was hosted on
the old Plesk server, the site and email stopped resolving when it went away.
Step 1 fixes that, but it needs access to your **domain registrar** (where the
domain was bought: GoDaddy, Namecheap, Google/Squarespace, etc.), not Plesk.

---

## 1. DNS at DigitalOcean

All DNS for `rowanheatingandair.com` lives in **DigitalOcean DNS** (free).
It's also what lets the load balancer issue its free HTTPS certificate.

1. *Networking → Domains → Add domain*: `rowanheatingandair.com`.
2. At your **domain registrar**, change the domain's **nameservers** to
   `ns1.digitalocean.com`, `ns2.digitalocean.com`, `ns3.digitalocean.com`.
   This can take a few hours to take effect; check on dnschecker.org (type
   *NS*). Do this early: the load balancer's certificate (step 8) only works
   once it has.
3. Add the records below as you reach each step, either in the control
   panel or with the script.

**All the DNS records** (*Networking → Domains → rowanheatingandair.com*):

| Type | Hostname | Value | Priority | Added in |
| --- | --- | --- | --- | --- |
| MX | `@` | `mx.zoho.com` | 10 | step 4 |
| MX | `@` | `mx2.zoho.com` | 20 | step 4 |
| MX | `@` | `mx3.zoho.com` | 50 | step 4 |
| TXT | `@` | `v=spf1 include:zoho.com ~all` | | step 4 |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:info@rowanheatingandair.com` | | step 4 |
| TXT | `@` | `zoho-verification=zb…zmverify.zoho.com` (Zoho gives you this) | | step 4 |
| TXT | `zmail._domainkey` (Zoho shows the exact name) | `v=DKIM1; k=rsa; p=…` (from Zoho) | | step 4 |
| A | `@` | the load balancer | | step 8 |
| A | `www` | the load balancer | | step 8 |

(EU Zoho accounts: use `mx.zoho.eu` etc. and `include:zoho.eu`.) Only one SPF
TXT record may exist; if you ever add another email sender, extend that one
record instead of adding a second.

**Or with the script** (`deploy/digitalocean/dns.sh`), from any Linux or Mac
machine, e.g. droplet 1 once it exists: install `doctl`
(`snap install doctl`), run `doctl auth init` with an API token
(*API → Generate New Token*, read + write), then:

```bash
bash deploy/digitalocean/dns.sh        # domain + Zoho MX, SPF, DMARC
ZOHO_VERIFY="zoho-verification=zb…" ZOHO_DKIM_SELECTOR="zmail" ZOHO_DKIM_VALUE="v=DKIM1; k=rsa; p=…" \
  bash deploy/digitalocean/dns.sh      # + Zoho verification and DKIM (step 4)
LB_IP=<load balancer IP> bash deploy/digitalocean/dns.sh   # + website (step 8)
```

It skips records that already exist and warns instead of overwriting an
existing SPF or A record, so it's safe to re-run.

## 2. Database: Managed MySQL

*Databases → Create → MySQL 8*, same region, smallest size is fine to start.

1. *Users & Databases*: add database `rowanhvac` and user `rowanhvac`.
2. *Settings → Trusted sources*: add the droplets (easiest: the tag
   `rowanhvac-app` you'll give them in step 5).
3. *Overview → Connection details*: choose **Private network**, note host,
   port (25060), password, and **Download CA certificate**
   (`ca-certificate.crt`).

`DATABASE_URL` (step 6):
```
mysql://rowanhvac:PASSWORD@private-db-host:25060/rowanhvac?sslaccept=strict&sslcert=/etc/rowanhvac/ca-certificate.crt
```

## 3. Files: Spaces

*Spaces Object Storage → Create*: same region, name e.g. `rowanhvac-files`,
**Restrict file listing**. Then *API → Spaces Keys → Generate* (limit it to
this bucket if offered) and note the key + secret. Files stay private: the
app serves them only to signed-in users who may see them.

## 4. Email: Zoho Mail

1. Sign up at zoho.com/mail for **Mail Lite or higher**. The free plan has
   no IMAP/SMTP, which both the website and the van app's Email tab need.
2. Add `rowanheatingandair.com` in Zoho. Zoho shows a **verification** TXT
   value and, later, a **DKIM** selector and value. Add them plus the MX, SPF
   and DMARC records from the table in step 1 (or run `dns.sh`), then click
   *Verify* in Zoho. Website emails are sent through Zoho too, so this one SPF
   record covers everything.
3. Create the mailboxes (info@, each tech…). For each user: *Settings →
   Mail → POP/IMAP Access* → **IMAP Access on**.
4. For the website's automatic emails, pick the mailbox they come from
   (e.g. `info@`). If it uses two-factor sign-in, create an **app-specific
   password** for it (*Zoho Accounts → Security → App Passwords*).
5. Moving mail from the old Plesk server? Zoho's *Migration* tool can import
   existing mailboxes over IMAP.

Webmail is at mail.zoho.com (and the Zoho Mail phone app).

## 5. Droplets

*Droplets → Create* **three** identical droplets in one go:

- **Region:** the same as the database and Spaces (e.g. NYC3), default VPC
- **Image:** Ubuntu 24.04 (LTS) x64
- **Size:** Basic, Regular, **2 GB RAM / 1 CPU** or more (the build needs
  ~2 GB; the setup script adds swap as a safety net)
- **Authentication:** your **SSH key** (more secure than a password)
- **Quantity: 3**, hostnames `rowanhvac-app-1`, `rowanhvac-app-2`,
  `rowanhvac-app-3`
- **Tags:** `rowanhvac-app` (the database, load balancer and firewall all
  find the droplets by this tag)
- Enable **Monitoring** (free) and, optionally, **Backups**

Note each droplet's **public IP** (for SSH). Then on **each of the three**
(Windows: PowerShell has `ssh`/`scp` built in):

```bash
ssh root@DROPLET_IP
curl -fsSL https://raw.githubusercontent.com/Jamesrowan11/RowanHVAC/main/deploy/digitalocean/setup-droplet.sh -o setup-droplet.sh
BRANCH=main bash setup-droplet.sh          # or BRANCH=claude/epic-bell-jg2dxs
```

Then upload the database CA certificate (from your computer):
```bash
scp ca-certificate.crt root@DROPLET_IP:/etc/rowanhvac/ca-certificate.crt
```

> Private repository: the script tells you how to add a deploy key if the
> clone fails. The raw `curl` also fails for a private repo; copy the script
> over with `scp deploy/digitalocean/setup-droplet.sh root@DROPLET_IP:` instead.

## 6. The shared `.env`

Make **one** `.env` on your computer from `.env.example` and copy the same
file to every droplet. The secrets must match on all of them: sign-ins,
forms and stored mailbox passwords depend on it.

```ini
DATABASE_URL="mysql://rowanhvac:PASSWORD@private-db-host:25060/rowanhvac?sslaccept=strict&sslcert=/etc/rowanhvac/ca-certificate.crt"
AUTH_SECRET="<openssl rand -base64 32>"
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="<openssl rand -base64 32>"
AUTH_URL="https://rowanheatingandair.com"

SPACES_BUCKET="rowanhvac-files"
SPACES_REGION="nyc3"
SPACES_KEY="<spaces key>"
SPACES_SECRET="<spaces secret>"

EMAIL_FROM="Rowan Heating & Air Conditioning <info@rowanheatingandair.com>"
EMAIL_SMTP_USER="info@rowanheatingandair.com"
EMAIL_SMTP_PASSWORD="<info@ password or Zoho app-specific password>"
MAIL_ALLOWED_DOMAIN="rowanheatingandair.com"
# Zoho EU data center only: MAIL_SMTP_HOST="smtppro.zoho.eu"  MAIL_IMAP_HOST="imappro.zoho.eu"

APP_TIMEZONE="America/New_York"
SPEED_ALERT_MPH="80"
```

```bash
scp .env root@DROPLET_IP:/var/www/rowanhvac-app/.env
ssh root@DROPLET_IP "chown rowan:rowan /var/www/rowanhvac-app/.env && chmod 600 /var/www/rowanhvac-app/.env"
```

## 7. First build

On **droplet 1** (creates the database tables):
```bash
ssh root@DROPLET1_IP
su - rowan
cd /var/www/rowanhvac-app
npm ci
npx prisma migrate deploy
npm run build
npm run create-admin -- --email you@rowanheatingandair.com --name "Your Name"
pm2 start ecosystem.config.js && pm2 save
curl -s http://127.0.0.1:3000/api/health      # {"ok":true}
```

On **droplets 2 and 3** (no migrate, no create-admin; the database is shared):
```bash
ssh root@DROPLET2_IP
su - rowan -c "cd /var/www/rowanhvac-app && npm ci && npm run build && pm2 start ecosystem.config.js && pm2 save"
curl -s http://127.0.0.1:3000/api/health      # {"ok":true}
```
(then the same on `DROPLET3_IP`)

`create-admin` prints a **temporary password**. Once the site is up (step 8),
sign in at `/login` with it and change it under **My Profile**. Then add
office staff and technicians under **Admin → Users**. Run `create-admin` again
any time to add another admin or reset a forgotten admin password.

> Don't run `npm run db:seed` on the live site: it loads demo data and wipes
> everything else. It refuses to run once real accounts exist.

## 8. Load balancer

*Networking → Load Balancers → Create*: **Regional**, same region + VPC,
1 node is plenty to start (add nodes later if traffic grows).

- **Droplets:** by tag `rowanhvac-app` (all three join automatically).
- **Forwarding rules:**
  - HTTPS 443 → HTTP 80, certificate: **Let's Encrypt** for
    `rowanheatingandair.com` and `www.rowanheatingandair.com`
  - HTTP 80 → HTTP 80
- **Advanced settings:**
  - **Redirect HTTP to HTTPS:** on
  - **Health check:** HTTP, port 80, path `/api/health`; check every 10 s,
    unhealthy after 3 failures, healthy after 3 successes. A droplet that
    can't reach the database is taken out of rotation automatically.
  - **Algorithm:** round robin (default)
  - **Sticky sessions:** Cookies (keeps each visitor on one droplet
    during a rolling update)

Then point the website at it: in *Networking → Domains →
rowanheatingandair.com*, add **A** records for `@` and `www` that point at the
load balancer (pick it from the list), or run
`LB_IP=<load balancer IP> bash deploy/digitalocean/dns.sh`.

## 9. Firewall

*Networking → Firewalls → Create*, applied to tag `rowanhvac-app`:
- Inbound **HTTP 80** from the **load balancer** only
- Inbound **SSH 22** from your own IP
- Outbound: all

The droplets are then reachable only through the load balancer.

## 10. Only if you have an old server: moving its data

Starting from scratch? Skip this step.

1. **Database.** On the new database, step 7 has already created the
   tables. On the old server, dump data only and import it:
   ```bash
   mysqldump -u USER -p --no-create-info --skip-triggers --complete-insert \
     --ignore-table=OLD_DB._prisma_migrations OLD_DB > rowanhvac-data.sql
   mysql -h private-db-host -P 25060 -u rowanhvac -p --ssl-ca=ca-certificate.crt rowanhvac < rowanhvac-data.sql
   ```
   (Run the import from a droplet, since the database only accepts trusted
   sources.)
2. **Uploaded files.** Copy the old `UPLOAD_DIR` folder to droplet 1, then:
   ```bash
   su - rowan -c "cd /var/www/rowanhvac-app && UPLOAD_DIR=/path/to/old/uploads npm run storage:migrate"
   ```
   It uploads them to Spaces under the same names (safe to re-run).
3. **Vans:** see below.

## The van laptops

Nothing to reinstall: they already use `https://rowanheatingandair.com`.
On a brand-new database their old sign-in is no longer valid, so each van
shows the sign-in screen on its next sync. Create each tech's account first
(**Admin → Users**, role *Employee*), then sign the van in with it. Techs
connect the Email tab once with their **Zoho** login.

## Updating later

From your computer (one droplet at a time; migrations on the first):
```bash
bash deploy/digitalocean/deploy-all.sh DROPLET1_IP DROPLET2_IP DROPLET3_IP
```

The other two keep serving the site while each one updates.

Adding a 4th droplet later: create it with the tag, run `setup-droplet.sh`,
copy the CA certificate and `.env`, then do step 7's droplet-2 commands. The
load balancer picks it up by tag. Removing one: just destroy it; the load
balancer stops sending it traffic.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Load balancer shows a droplet **down** | `ssh root@IP "curl -s http://127.0.0.1:3000/api/health"`; `su - rowan -c "pm2 logs --lines 80"` |
| `{"ok":false,"error":"database unreachable"}` | `DATABASE_URL`; droplet in the DB's *Trusted sources*; CA file at `/etc/rowanhvac/ca-certificate.crt`. If the certificate check fails on the private host, use `?sslaccept=accept_invalid_certs` (still encrypted) |
| Sign-in loops back to `/login` | `AUTH_URL` exactly `https://rowanheatingandair.com`; same `AUTH_SECRET` on all droplets |
| "Failed to find Server Action" after an update | all droplets on the same commit (`deploy-all.sh`), the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, and the app in the **same folder** (`/var/www/rowanhvac-app`) on every droplet, since Next.js derives form IDs from file paths |
| Uploads fail or files missing | `SPACES_*` values; key has access to the bucket |
| Manual uploads fail with 413 | nginx config from `setup-droplet.sh` (60 MB limit) |
| Website emails show `FAILED` in the email history | `EMAIL_SMTP_USER/PASSWORD`; IMAP/SMTP access on in Zoho; app-specific password if 2FA; Zoho plan isn't Free |
| Van Email tab: "password didn't work" | the tech's Zoho login (or app-specific password); IMAP access on for that user |
| `npm run build` gets "Killed" | not enough memory: 2 GB droplet, or rerun `setup-droplet.sh` (adds swap) |
