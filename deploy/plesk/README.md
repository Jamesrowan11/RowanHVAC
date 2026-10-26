# Deploying on a DigitalOcean droplet with Plesk

Two ways: **A. all in the Plesk web panel** (Node.js + Git extensions, no
SSH), or **B. over SSH** (PM2 + nginx, further below). Pick one.

## A. In the Plesk panel (no SSH)

Uses Plesk's own Node.js hosting (Phusion Passenger runs `server.js`) and
its Git integration. Examples use `portal.rowanheatingandair.com`.

1. **Extensions** (once): *Tools & Settings → Updates → Add/Remove
   Components*: make sure **Node.js support** (Node 20) and **Git** are
   installed. Plesk Obsidian usually has both already.
2. **DNS:** A record `portal` → droplet IP (in Plesk *DNS Settings* if Plesk
   hosts your DNS).
3. **Subdomain:** *Websites & Domains → Add Subdomain* →
   `portal.rowanheatingandair.com`.
4. **HTTPS:** on the subdomain → *SSL/TLS Certificates* → **Let's Encrypt**
   → *Get it free*. Then *Hosting Settings* → tick **Permanent SEO-safe 301
   redirect from HTTP to HTTPS**.
5. **Database:** *Databases → Add Database*: name `rowanhvac`, new user
   `rowanhvac` + a strong password (avoid `@ : / ? #` in it).
6. **Code (Git):** on the subdomain → **Git** → *Add Repository*
   - Remote: `https://github.com/Jamesrowan11/RowanHVAC.git`. If the repo is
     private, use `git@github.com:Jamesrowan11/RowanHVAC.git` and add the SSH
     key Plesk shows to GitHub → repo → *Settings → Deploy keys*.
   - Branch: `main` (or `claude/epic-bell-jg2dxs`)
   - **Deployment path:** `portal-app`
   - Deployment mode: **Manual** for now (automatic is set up in step 12).
   - Click *OK*, then **Pull now / Deploy now**.
7. **Settings file:** *Files* → open `portal-app` → copy `.env.example` to
   `.env` → edit `.env`:
   ```ini
   DATABASE_URL="mysql://rowanhvac:DB_PASSWORD@localhost:3306/rowanhvac"
   AUTH_SECRET="<a long random string, 40+ characters>"
   AUTH_URL="https://portal.rowanheatingandair.com"
   UPLOAD_DIR="/var/www/vhosts/rowanheatingandair.com/portal-uploads"
   EMAIL_FROM="Rowan Heating & Air Conditioning <info@rowanheatingandair.com>"
   MAIL_HOST="localhost"
   MAIL_ALLOWED_DOMAIN="rowanheatingandair.com"
   APP_TIMEZONE="America/New_York"
   ```
   Also create the folder `portal-uploads` next to `portal-app` (in the
   subscription's home, so redeploys never touch customer files).
8. **Node.js app:** on the subdomain → **Node.js** → *Enable Node.js*, then
   - Node.js version: **20.x**
   - Document root: `/portal-app/public`
   - Application mode: **production**
   - Application root: `/portal-app`
   - Application startup file: `server.js`
9. Still on the Node.js page: click **NPM install**, then **Run script** and
   run, one at a time:
   - `db:migrate` (creates the database tables)
   - `build` (takes a few minutes)
   - `db:seed` (**first time only**: demo accounts incl.
     `admin@rowanhvac.com` / `Password123!`. Log in right away and change
     that admin's email and password, and deactivate the demo users.)
10. Click **Restart App**, then open `https://portal.rowanheatingandair.com`.
    You should see the login page.
11. **Big uploads (manuals):** *Apache & nginx Settings* → **Additional nginx
    directives** → add `client_max_body_size 60m;` → *OK*.
12. **Updates:** in *Git* → repository settings → enable **Additional
    deployment actions** and paste:
    ```bash
    export PATH=/opt/plesk/node/20/bin:$PATH
    npm ci && npx prisma migrate deploy && npm run build && touch tmp/restart.txt
    ```
    Then each update is just *Git → Pull now* (or switch Deployment mode to
    **Automatic** and add the webhook URL Plesk shows to GitHub → *Settings →
    Webhooks*, so every push to the branch deploys itself).

**If `build` fails with "out of memory" / "Killed":** a 1 GB droplet is too
small to build Next.js. Resize the droplet to 2 GB+ in DigitalOcean, or add
swap (that needs SSH: `fallocate -l 2G /swapfile && chmod 600 /swapfile &&
mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >>
/etc/fstab`).

**Browser says "Not secure" (https crossed out):** the subdomain has no
valid certificate yet, and the van app won't connect until it does. On the
subdomain → *SSL/TLS Certificates* → **Let's Encrypt** → tick the
`portal.` name (and `www.` only if it has DNS) → *Get it free*. Then *Hosting
Settings* → *Certificate*: pick the Let's Encrypt one → *OK*. Let's Encrypt
only works once the DNS A record points at this droplet.

**Seeing the marketing home page instead of the login page?** That's the
app's front page. Its **Portal Login** button goes to the login screen. To
make the portal address open the login page directly, add `PORTAL_ONLY="1"` to
`.env`, then *Run script* `build` and *Restart App*.

**If the site shows Plesk's default page or "Web application could not be
started":** recheck the step 8 values, open *Logs* on the subdomain, and make
sure step 9 finished (`.next` folder exists in `portal-app`).

---

## B. Over SSH

The portal is a Node.js app. On Plesk it runs under **PM2** (keeps it running,
restarts it on reboot), and Plesk's **nginx** serves the domain with a free
**Let's Encrypt** certificate and forwards requests to the app on
`127.0.0.1:3000`. The van laptops then sync with `https://<portal domain>`.

Replace these placeholders everywhere below:

| Placeholder | Example |
| --- | --- |
| `PORTAL_DOMAIN` | `portal.rowanheatingandair.com` |
| `MAIN_DOMAIN` | `rowanheatingandair.com` (the Plesk subscription it lives under) |
| `DROPLET_IP` | your droplet's IP address |
| `YOU@EMAIL` | email for Let's Encrypt notices |

## 0. DNS (at your DNS provider, or Plesk if it hosts DNS)

Add an **A record**: `portal` → `DROPLET_IP`. Wait until `ping PORTAL_DOMAIN`
shows the droplet's IP (usually a few minutes).

## 1. SSH in

```bash
ssh root@DROPLET_IP
```

## 2. Create the site, SSL, and database in Plesk (from SSH)

```bash
# The portal domain, as a subdomain site under your existing subscription
plesk bin site --create PORTAL_DOMAIN -webspace-name MAIN_DOMAIN -www-root PORTAL_DOMAIN

# Free HTTPS certificate (auto-renews)
plesk bin extension --exec letsencrypt cli.php -d PORTAL_DOMAIN -m YOU@EMAIL

# Database + user (pick a strong password and keep it for step 5)
plesk bin database --create rowanhvac -domain MAIN_DOMAIN -type mysql
plesk bin database --create-dbuser rowanhvac -passwd 'DB_PASSWORD' -domain MAIN_DOMAIN -server localhost:3306 -database rowanhvac
```

> If any `plesk bin` command complains about its options (they differ a little
> between Plesk versions), do that step in the Plesk web UI instead:
> *Websites & Domains → Add Subdomain*, *SSL/TLS Certificates → Let's Encrypt*,
> *Databases → Add Database*. Everything else stays the same.

## 3. Install Node.js 20, PM2, and git

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
npm install -g pm2
node -v    # v20.x
```

## 4. Get the code (as a non-root app user)

```bash
adduser --disabled-password --gecos "" rowan
mkdir -p /var/www/rowanhvac-app /var/www/rowanhvac-uploads
chown rowan:rowan /var/www/rowanhvac-app /var/www/rowanhvac-uploads
su - rowan
cd /var/www/rowanhvac-app
git clone https://github.com/Jamesrowan11/RowanHVAC.git .
git checkout main    # or the branch you want to run, e.g. claude/epic-bell-jg2dxs
```

Private repository? Either clone with a GitHub personal access token
(`https://<TOKEN>@github.com/Jamesrowan11/RowanHVAC.git`), or create a deploy
key: `ssh-keygen -t ed25519` as `rowan`, add `~/.ssh/id_ed25519.pub` in GitHub
→ repo → *Settings → Deploy keys*, and clone `git@github.com:Jamesrowan11/RowanHVAC.git`.

## 5. Configure (`.env`)

Still as `rowan`, in `/var/www/rowanhvac-app`:

```bash
cp .env.example .env
nano .env
```

Set at least:

```ini
DATABASE_URL="mysql://rowanhvac:DB_PASSWORD@localhost:3306/rowanhvac"
AUTH_SECRET="<run: openssl rand -base64 32>"
AUTH_URL="https://PORTAL_DOMAIN"
UPLOAD_DIR="/var/www/rowanhvac-uploads"
EMAIL_FROM="Rowan Heating & Air Conditioning <info@MAIN_DOMAIN>"

# Van app "Email" tab: Plesk mail runs on this same server
MAIL_HOST="localhost"
MAIL_ALLOWED_DOMAIN="MAIN_DOMAIN"

APP_TIMEZONE="America/New_York"
SPEED_ALERT_MPH="80"
```

If the password contains `@ : / ? #`, URL-encode it in `DATABASE_URL`
(e.g. `@` → `%40`), or choose one without those characters.

## 6. Build and start

```bash
npm ci
npx prisma migrate deploy
npm run build

# First time only: creates demo accounts, including admin@rowanhvac.com /
# Password123!. Log in right away and change the admin's email + password,
# and deactivate the demo users (Admin → Users).
npm run db:seed

pm2 start ecosystem.config.js
pm2 save
exit    # back to root
```

Make PM2 start on boot (as root):

```bash
env PATH=$PATH:/usr/bin pm2 startup systemd -u rowan --hp /home/rowan
```

Check: `curl -I http://127.0.0.1:3000/login` should return `200`.

## 7. Point the domain at the app (nginx)

```bash
plesk bin domain --update-web-server-settings PORTAL_DOMAIN \
  -nginx-proxy-mode false \
  -additional-nginx-settings-file /var/www/rowanhvac-app/deploy/plesk/nginx-directives.conf
```

> Or in the UI: *Websites & Domains → PORTAL_DOMAIN → Apache & nginx Settings*:
> untick **Proxy mode**, paste `deploy/plesk/nginx-directives.conf` into
> **Additional nginx directives**, then click **OK**.

Open `https://PORTAL_DOMAIN`. You should see the portal's login page.

## 8. Mail for the van app's Email tab

- Plesk → *Mail* → make sure each tech has a mailbox (the one they use at
  webmail).
- Recommended: *Mail → Mail Settings → SSL/TLS certificate for mail* → use a
  Let's Encrypt certificate (`MAIL_HOST="localhost"` works either way).
- Test from a van: Email tab → **Connect** with the tech's webmail login.

## 9. Firewall (DigitalOcean)

The app only listens on `127.0.0.1`, so port 3000 isn't reachable from
outside anyway. In the DigitalOcean firewall (or Plesk *Tools & Settings →
Firewall*) leave open only what Plesk needs: 22, 80, 443, 8443 (Plesk panel),
and the mail ports 25, 465, 587, 993.

## Updating later

```bash
ssh root@DROPLET_IP
su - rowan -c "cd /var/www/rowanhvac-app && SKIP_PUBLIC=1 bash deploy/deploy.sh"
```

This pulls the latest code, installs packages, runs database migrations,
rebuilds, and reloads the app with no downtime.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| 502 Bad Gateway | `su - rowan -c "pm2 logs rowanhvac-portal --lines 50"`. Is the app running? Is `.env` right? |
| Login page loads but sign-in fails | `AUTH_URL` must be exactly `https://PORTAL_DOMAIN`; `AUTH_SECRET` set |
| `P1001 Can't reach database` | `DATABASE_URL` user/password/db name; `mysql -u rowanhvac -p rowanhvac` |
| Manual uploads fail ("413") | the `client_max_body_size 60m;` directive from step 7 is missing |
| Vans: "Secure connection failed" | the Let's Encrypt cert from step 2 isn't on PORTAL_DOMAIN, or the laptop's clock is wrong |
| Van Email tab can't connect | `MAIL_HOST`; try `MAIL_TLS_ALLOW_SELF_SIGNED="1"` if mail uses Plesk's default cert |
