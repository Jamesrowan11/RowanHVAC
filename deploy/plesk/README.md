# Deploying on a DigitalOcean droplet with Plesk

Everything is **one app on one domain, `rowanheatingandair.com`**:

- `https://rowanheatingandair.com/`: the public website (quote form included)
- `https://rowanheatingandair.com/login` → `/portal`: customers, techs, office
- `https://rowanheatingandair.com/api/van/v1/…`: what the van laptops sync with
- `https://webmail.rowanheatingandair.com`: Roundcube, unchanged (Plesk mail)

Two ways to set it up: **A. in the Plesk web panel** (no SSH), or **B. over
SSH**. Pick one. Already running it on `portal.rowanheatingandair.com`? Start
with **Moving from portal.rowanheatingandair.com** below.

> **Heads-up:** this replaces whatever website is on rowanheatingandair.com
> today. Plesk keeps those files (in `httpdocs`); it just stops serving them.
> Download a backup of `httpdocs` first (*Files* → select → *Archive*) if you
> may want them back.

---

## Moving from portal.rowanheatingandair.com

If you already set the app up on the `portal.` subdomain, you keep the same
database, accounts, jobs, messages and uploaded files. Only where the app is
served changes.

1. **Set it up on the main domain** with steps A3–A11 below. In A5 (Git),
   reuse the same repository URL and branch. In A6 (`.env`), copy the values
   from `portal-app/.env` (same `DATABASE_URL`, `AUTH_SECRET`, and
   **the same `UPLOAD_DIR`**, so uploaded documents and manuals carry over),
   and change only `AUTH_URL` to `https://rowanheatingandair.com`. Remove
   `PORTAL_ONLY` if you added it. Skip `db:seed` in A8: the database is
   already set up.
2. Check `https://rowanheatingandair.com` shows the website, and that you can
   sign in at `/login`.
3. **Retire the subdomain:** *Websites & Domains → portal.rowanheatingandair.com
   → Hosting & DNS → Hosting Settings* (or the **Node.js** page → *Disable
   Node.js*), then change its hosting type to **Forwarding** to
   `https://rowanheatingandair.com` with **Moved permanently (301)**. Old links
   and bookmarks then land on the main site. (Or remove the subdomain
   entirely.)
4. **Vans:** update the laptops with the latest `RowanVan.zip`. A van still
   set to `portal.rowanheatingandair.com` switches itself to
   `rowanheatingandair.com` and stays signed in.

---

## A. In the Plesk panel (no SSH)

Uses Plesk's own Node.js hosting (Phusion Passenger runs `server.js`) and its
Git integration.

1. **Extensions** (once): *Tools & Settings → Updates → Add/Remove
   Components*: make sure **Node.js support** (Node 20) and **Git** are
   installed. Plesk Obsidian usually has both already.
2. **DNS:** `rowanheatingandair.com` and `www` should already point at this
   droplet (they do if the current site is hosted here). Check in *Websites &
   Domains → rowanheatingandair.com → DNS Settings*, or at your DNS provider.
3. **HTTPS:** *Websites & Domains → rowanheatingandair.com → SSL/TLS
   Certificates* → **Let's Encrypt**. Tick the domain, **www**, and also
   **webmail** and **"Secure the mail domain"** if offered (that also fixes
   webmail/mail certificate warnings) → *Get it free*. Then *Hosting Settings*:
   - **Permanent SEO-safe 301 redirect from HTTP to HTTPS**: on
   - **Preferred domain**: `rowanheatingandair.com` (sends `www.` to it)
   - **Certificate**: the Let's Encrypt one
4. **Database** (new installs only): *Databases → Add Database*: name
   `rowanhvac`, new user `rowanhvac` + a strong password (avoid `@ : / ? #`).
5. **Code (Git):** *Websites & Domains → rowanheatingandair.com → **Git** →
   Add Repository*
   - Remote: `https://github.com/Jamesrowan11/RowanHVAC.git`. If the repo is
     private, use `git@github.com:Jamesrowan11/RowanHVAC.git` and add the SSH
     key Plesk shows to GitHub → repo → *Settings → Deploy keys*.
   - Branch: `main` (or `claude/epic-bell-jg2dxs`)
   - **Deployment path:** `rowanhvac-app`
   - Deployment mode: **Manual** for now (automatic is in step 11).
   - *OK*, then **Pull now / Deploy now**.
6. **Settings file:** *Files* → `rowanhvac-app` → copy `.env.example` to
   `.env` → edit:
   ```ini
   DATABASE_URL="mysql://rowanhvac:DB_PASSWORD@localhost:3306/rowanhvac"
   AUTH_SECRET="<a long random string, 40+ characters>"
   AUTH_URL="https://rowanheatingandair.com"
   UPLOAD_DIR="/var/www/vhosts/rowanheatingandair.com/rowanhvac-uploads"
   EMAIL_FROM="Rowan Heating & Air Conditioning <info@rowanheatingandair.com>"
   MAIL_HOST="localhost"
   MAIL_ALLOWED_DOMAIN="rowanheatingandair.com"
   APP_TIMEZONE="America/New_York"
   ```
   New install: create the folder `rowanhvac-uploads` next to `rowanhvac-app`
   (outside the code, so updates never touch customer files). Moving from the
   subdomain: keep your existing `UPLOAD_DIR` (e.g. `.../portal-uploads`).
7. **Node.js app:** *rowanheatingandair.com → **Node.js** → Enable Node.js*:
   - Node.js version: **20.x**
   - Document root: `/rowanhvac-app/public`
   - Application mode: **production**
   - Application root: `/rowanhvac-app`
   - Application startup file: `server.js`
8. On the Node.js page: **NPM install**, then **Run script**, one at a time:
   - `db:migrate` (creates/updates the database tables)
   - `build` (takes a few minutes)
   - `db:seed`: **new installs only**. It creates demo accounts, including
     `admin@rowanhvac.com` / `Password123!`. Sign in right away, change that
     admin's email and password, and deactivate the demo users.
9. **Restart App**, then open `https://rowanheatingandair.com`: the website.
   **Portal Login** (top right) → `/login`.
10. **Big uploads (manuals):** *Apache & nginx Settings* → **Additional nginx
    directives** → add `client_max_body_size 60m;` → *OK*.
11. **Updates:** *Git* → repository settings → enable **Additional deployment
    actions** and paste:
    ```bash
    export PATH=/opt/plesk/node/20/bin:$PATH
    npm ci && npx prisma migrate deploy && npm run build && touch tmp/restart.txt
    ```
    Each update is then *Git → Pull now* (or set Deployment mode to
    **Automatic** and add the webhook URL Plesk shows to GitHub → *Settings →
    Webhooks*, so every push deploys itself).

**`build` fails with "out of memory" / "Killed":** a 1 GB droplet is too small
to build Next.js. Resize the droplet to 2 GB+ in DigitalOcean, or add swap
(SSH: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile &&
swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab`).

**Browser says "Not secure":** redo step 3 (the Let's Encrypt certificate
must cover `rowanheatingandair.com` and `www`, and be selected in Hosting
Settings). It only works once DNS points at this droplet. The van app won't
connect until the certificate is valid.

**Still seeing the old website, Plesk's default page, or "Web application
could not be started":** recheck step 7, make sure step 8 finished (a `.next`
folder exists in `rowanhvac-app`), click *Restart App*, and look at *Logs*.

---

## B. Over SSH

On Plesk the app can also run under **PM2** (keeps it running, restarts it on
reboot), with Plesk's **nginx** serving the domain and forwarding to the app on
`127.0.0.1:3000`. Replace `DROPLET_IP` and `DB_PASSWORD` below.

### 1. Connect, certificate, database

```bash
ssh root@DROPLET_IP

# Free HTTPS certificate (auto-renews) for the domain and www
plesk bin extension --exec letsencrypt cli.php -d rowanheatingandair.com -d www.rowanheatingandair.com -m info@rowanheatingandair.com

# Database + user (new installs only)
plesk bin database --create rowanhvac -domain rowanheatingandair.com -type mysql
plesk bin database --create-dbuser rowanhvac -passwd 'DB_PASSWORD' -domain rowanheatingandair.com -server localhost:3306 -database rowanhvac
```

> If a `plesk bin` command complains about its options (they differ a little
> between Plesk versions), do that step in the panel instead (A3 / A4).

### 2. Node.js 20, PM2, git

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
npm install -g pm2
```

### 3. Get the code (as a non-root app user)

```bash
adduser --disabled-password --gecos "" rowan
mkdir -p /var/www/rowanhvac-app /var/www/rowanhvac-uploads
chown rowan:rowan /var/www/rowanhvac-app /var/www/rowanhvac-uploads
su - rowan
cd /var/www/rowanhvac-app
git clone https://github.com/Jamesrowan11/RowanHVAC.git .
git checkout main    # or claude/epic-bell-jg2dxs
```

Private repository? Clone with a GitHub token
(`https://<TOKEN>@github.com/Jamesrowan11/RowanHVAC.git`), or add a deploy key:
`ssh-keygen -t ed25519` as `rowan`, add `~/.ssh/id_ed25519.pub` in GitHub →
repo → *Settings → Deploy keys*, and clone `git@github.com:Jamesrowan11/RowanHVAC.git`.

### 4. Settings (`.env`)

```bash
cp .env.example .env && nano .env
```

```ini
DATABASE_URL="mysql://rowanhvac:DB_PASSWORD@localhost:3306/rowanhvac"
AUTH_SECRET="<run: openssl rand -base64 32>"
AUTH_URL="https://rowanheatingandair.com"
UPLOAD_DIR="/var/www/rowanhvac-uploads"
EMAIL_FROM="Rowan Heating & Air Conditioning <info@rowanheatingandair.com>"
MAIL_HOST="localhost"
MAIL_ALLOWED_DOMAIN="rowanheatingandair.com"
APP_TIMEZONE="America/New_York"
```

### 5. Build and start

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run db:seed        # new installs only (demo accounts; change the admin right away)
pm2 start ecosystem.config.js && pm2 save
exit                   # back to root
env PATH=$PATH:/usr/bin pm2 startup systemd -u rowan --hp /home/rowan
```

Check: `curl -I http://127.0.0.1:3000/` returns `200`.

### 6. Point the domain at the app

```bash
plesk bin domain --update-web-server-settings rowanheatingandair.com -nginx-proxy-mode false \
  -additional-nginx-settings-file /var/www/rowanhvac-app/deploy/plesk/nginx-directives.conf
```

(Or in the panel: *Apache & nginx Settings*: untick **Proxy mode**, paste
`deploy/plesk/nginx-directives.conf` into **Additional nginx directives**.)
Then *Hosting Settings*: **Preferred domain** `rowanheatingandair.com` and the
HTTP → HTTPS redirect on, as in A3.

### Updating later

```bash
su - rowan -c "cd /var/www/rowanhvac-app && bash deploy/deploy.sh"
```

---

## Mail for the van app's Email tab

- Plesk → *Mail*: each tech needs a mailbox (the one they use at webmail).
- The Let's Encrypt certificate from A3 with the mail/webmail boxes ticked
  also covers the mail server. `MAIL_HOST="localhost"` works either way.
- Test from a van: Email tab → **Connect** with the tech's webmail login.

## Firewall (DigitalOcean)

Keep open only what Plesk needs: 22, 80, 443, 8443 (Plesk panel), and the
mail ports 25, 465, 587, 993. The app itself listens only on the server.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| 502 Bad Gateway / app not starting | Panel: Node.js page → *Logs*; SSH: `su - rowan -c "pm2 logs rowanhvac-portal --lines 50"`. Is `.env` right? |
| Sign-in fails or bounces back to `/login` | `AUTH_URL` must be exactly `https://rowanheatingandair.com`; `AUTH_SECRET` set. Rebuild + restart after changing `.env`. |
| `P1001 Can't reach database` | `DATABASE_URL` user/password/database name |
| Manual uploads fail ("413") | the `client_max_body_size 60m;` nginx directive is missing |
| Vans: "Secure connection failed" | certificate (A3) not valid yet, or the laptop's date/time is wrong |
| Van Email tab can't connect | `MAIL_HOST`; try `MAIL_TLS_ALLOW_SELF_SIGNED="1"` if mail still uses Plesk's default certificate |
