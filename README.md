# Rowan Heating & Air Conditioning

A full-stack web application for **Rowan Heating & Air Conditioning** — a
family-owned HVAC company serving Highland, Fulton, and Howard County, Maryland
since 1958.

Everything runs as **one app on one domain, `rowanheatingandair.com`**:

| Address | What it is |
| --- | --- |
| `rowanheatingandair.com/` | The **public website**: services, why choose us, service area, real customer reviews, a quote form. SEO-ready (Open Graph, `HVACBusiness` JSON-LD). Quote requests land straight in the admin dashboard. |
| `rowanheatingandair.com/login` | **Sign-in** for customers, technicians and the office (one login, three roles: `CLIENT`, `EMPLOYEE`, `ADMIN`). |
| `rowanheatingandair.com/portal` | The **portal**: each role's dashboard, jobs, messaging, documents and payments, manuals, vehicles, email. |
| `rowanheatingandair.com/api/van/v1/*` | The **van app's sync API** (the Toughbook desktop app in `van-app/`). |

Company email (mailboxes and webmail) is **Zoho Mail** for
`@rowanheatingandair.com`. The website's automatic emails are sent through a
Zoho mailbox (e.g. info@), and the van app's Email tab sends as each tech
through their own Zoho mailbox.

It runs on **DigitalOcean**: Ubuntu droplets behind a **Load Balancer**, with
**Managed MySQL** and **Spaces** (file storage) shared by all droplets. See
[`deploy/digitalocean/README.md`](deploy/digitalocean/README.md).

## Tech stack

- **Next.js (App Router)** + React + TypeScript
- **Tailwind CSS** (navy `#1a2b4a` primary, warm-orange `#f57c1f` accent)
- **Prisma ORM** + **MySQL** (DigitalOcean Managed MySQL)
- **Auth.js / NextAuth v5** — email + password, bcrypt-hashed, JWT sessions
- **Email:** sent over SMTP from a company Zoho mailbox (nodemailer); Resend
  is an optional alternative; with neither, emails are logged to the console
- **Files:** DigitalOcean Spaces (S3 API) behind a load balancer, or local disk
- `server.js` under **PM2** (cluster mode) behind **nginx** on each droplet
  serves the website, portal and van API
- **Van app:** Python 3.4+ / Tkinter desktop app (`van-app/`), runs on Windows XP

## Security model

- **Server-side access control everywhere.** Every page loader, server action,
  and API route resolves the current user from the session and checks the role
  and record ownership on the *data itself* — never UI-only.
- **No IDOR.** Requesting another user's record (a document, a job, a
  conversation) by changing an id returns not-found / forbidden, never the data.
- **Session limits.** Sessions expire after ~30 minutes of inactivity and an
  absolute maximum of ~8 hours. The session cookie is `httpOnly`, `secure` (in
  production), and `sameSite=lax`. There is a clear **Log out** in every
  dashboard and no long-lived "remember me".
- **Deactivated users** cannot log in, are removed from assignment dropdowns,
  and are treated as logged-out mid-session — but their records are retained.

## Hardening & quality

- **Rate limiting** on public endpoints — the quote form (5 / 10 min per IP) and
  the inbound-email webhook (60 / min per IP). See `src/lib/rateLimit.ts` (swap
  the in-memory store for Redis/Upstash for multi-instance deployments).
- **Pagination** on the high-volume lists (requests, sent-email history,
  messages).
- **Automated tests** with Vitest covering the rate limiter, email parsing /
  validation, and password hashing. Run with `npm test`.
- **Resilient UX** — global `error`, `not-found`, and `loading` boundaries, plus
  a portal loading state. Favicon (`icon.svg`) and a generated Open Graph image
  (`/opengraph-image`) for rich link previews.

## Prerequisites

- Node.js 18+ (tested on Node 22)
- A MySQL / MariaDB database (GoDaddy cPanel provides this; locally you can run
  MariaDB/MySQL)

## Local setup

```bash
# 1. Install dependencies (also runs `prisma generate`)
npm install

# 2. Create your environment file
cp .env.example .env
#    then edit .env — at minimum set DATABASE_URL (mysql://…) and AUTH_SECRET
#    generate a secret:  openssl rand -base64 32

# 3. Create the database schema (runs the included migrations)
npx prisma migrate deploy
#    (for local development you can use:  npx prisma migrate dev)

# 4. Seed demo data (accounts, jobs, threads, a sample sent email, etc.)
npm run db:seed

# 5. Run it
npm run dev
#    open http://localhost:3000   (home page; portal at /login)
```

### Environment variables

`.env` in the repo root (see `.env.example`):

| Variable               | Required | Purpose                                                               |
| ---------------------- | :------: | --------------------------------------------------------------------- |
| `DATABASE_URL`         |   yes    | MySQL connection string (`mysql://user:pass@host:3306/db`).           |
| `AUTH_SECRET`          |   yes    | Secret used to sign session JWTs.                                     |
| `AUTH_URL`             |   rec.   | The site's address, `https://rowanheatingandair.com` (sign-in, links in emails). |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | LB | Same value on every droplet so any droplet can handle any form. |
| `SPACES_BUCKET` / `SPACES_REGION` / `SPACES_KEY` / `SPACES_SECRET` | LB | DigitalOcean Spaces for documents + manuals. Unset = local disk (`UPLOAD_DIR`). |
| `EMAIL_SMTP_USER` / `EMAIL_SMTP_PASSWORD` | rec. | Company Zoho mailbox the website's emails are sent from (e.g. info@). |
| `EMAIL_FROM`           |    no    | From-address for outgoing email. Defaults to the company address.    |
| `RESEND_API_KEY`       |    no    | Alternative to `EMAIL_SMTP_*`: send via Resend. With neither, email is logged to console. |
| `UPLOAD_DIR`           |    no    | Local-disk storage folder, only when Spaces isn't configured.         |
| `INBOUND_EMAIL_SECRET` |    no    | Shared secret required by the inbound-email webhook.                  |
| `MAIL_SMTP_HOST` / `MAIL_IMAP_HOST` | no | Mail servers (default Zoho: `smtppro.zoho.com` / `imappro.zoho.com`; `.eu` for EU). `MAIL_HOST` sets both. |
| `MAIL_SMTP_PORT` / `MAIL_IMAP_PORT` | no | Mail ports (defaults 465 TLS / 993).                    |
| `MAIL_ALLOWED_DOMAIN`  |    no    | Only mailboxes at this domain can be connected (default `rowanheatingandair.com`). |
| `MAIL_SENT_FOLDER`     |    no    | Force the Sent folder name (normally auto-detected).                  |
| `MAIL_TLS_ALLOW_SELF_SIGNED` | no | `1` only for a self-hosted mail server with a self-signed certificate. |
| `MAILBOX_SECRET`       |    no    | Encrypts stored mailbox passwords (defaults to a key derived from `AUTH_SECRET`). |
| `APP_TIMEZONE`         |    no    | Company time zone for the Vehicles page (default `America/New_York`). |
| `SPEED_ALERT_MPH`      |    no    | Email admins when a van exceeds this speed (default 80; `0` = off).   |
| `SPEED_RETENTION_DAYS` |    no    | How long van speed readings are kept (default 365).                   |

The app **runs fully without an email key** — every email is recorded in the
`EmailLog` table and printed to the server console instead of being sent.

## Accounts

**Live site:** create the first admin with
`npm run create-admin -- --email you@rowanheatingandair.com --name "Your Name"`
(prints a temporary password), then add everyone else under **Admin → Users**.

**Demo data (development only):** `npm run db:seed` wipes the database and
loads the accounts below. It refuses to run on a database that already has
accounts unless `SEED_RESET=1`. **Password for all demo accounts:** `Password123!`

| Role     | Email                 |
| -------- | --------------------- |
| Admin    | `admin@rowanhvac.com` |
| Employee | `tech@rowanhvac.com`  |
| Client   | `client@example.com`  |

The seed also creates a second employee and client, sample jobs (scheduled,
in-progress, completed, and a cancelled one), an active maintenance policy, a
payment link, a company announcement, a sample sent email, and a client↔admin
message thread, so every feature can be exercised immediately.

## What each role can do

**Admin** — view/delete incoming requests; create & assign jobs (to employees
*or* admins); track live job progress and tech notes; cancel jobs with a reason
(kept in the DB, reinstatable); manage users (create/edit, reset passwords,
activate/deactivate); manage maintenance policies; post announcements; share
payment links and documents (with optional client email); compose email to
portal users and/or typed addresses (≤25 recipients) with full sent history;
edit their own profile/password.

**Employee** — see their assigned schedule; open a job to update status
(Scheduled → In Progress → Completed) and write timestamped notes; compose email
to clients (own sent history only); view announcements; edit their own
profile/password.

**Client** — see upcoming/past appointments (cancelled shown as Cancelled);
submit service/quote requests; view service history; schedule maintenance *if*
they have an active policy (otherwise prompted to contact the company); view and
download shared documents and payment links; edit their own profile/password.
Internal staff notes are never visible to clients.

**Messaging** (all roles) — an in-app Messages section with an unread badge.
Admins and employees can start threads with anyone (recipient picker); clients
can only message "the company" and never see a staff directory. Membership is
enforced server-side.

## Van terminals (Toughbook desktop app)

`van-app/` is an offline-first **desktop app** for the technicians' Panasonic
Toughbook CF-29 laptops (Python 3.4+/Tkinter, so it runs on Windows XP). Each
van keeps a local copy of its tech's jobs and messages, works without signal,
and syncs through this portal, so every van and the office see the same jobs,
statuses, notes, and **messages** (the same conversations as the portal's
Messages page). Techs can also **send email from their own Zoho mailbox**.
Install steps and details:
[`van-app/README.md`](van-app/README.md).

- API (part of the portal, nothing extra to deploy): `POST /api/van/v1/login`,
  `/api/van/v1/sync`, `/api/van/v1/mailbox`, `/api/van/v1/logout`. Vans
  authenticate with a per-device bearer token (only its hash is stored, in
  `VanDevice`).
- Email from the van goes out **through the portal**, which signs in to the
  company mail server as that tech (SMTP to send, IMAP to save a copy in their
  Sent folder). Mailbox passwords are stored encrypted (`Mailbox` table,
  AES-256-GCM) and never stored on the laptops. Every van email is also
  recorded in `EmailLog`. See the `MAIL_*` settings above.
- **Equipment manuals** (`Manual` table, files in Spaces): admins upload
  them under **Manuals** (brand tabs → model tabs, up to 50 MB each, via the
  `/portal/manuals/upload` route since server actions cap bodies at 10 MB).
  Staff can open them; vans download them on demand
  (`GET /api/van/v1/manuals/:id`) and keep them for offline use. nginx on the
  droplets allows 60 MB request bodies for this.
- **Vehicles (OBD-II)**: with an ELM327 adapter on the van's OBD-II port, the
  van app logs speed every few seconds and reads trouble codes. Readings ride
  along with each sync (`VehicleSpeed`, `VehicleCodeReport`). Admins see them
  under **Admin → Vehicles** (fleet status, a day's speed chart, speed at a
  given time, stretches over a limit, code history with descriptions) and get
  emailed on speeding (`SPEED_ALERT_MPH`) and on new trouble codes.
- Same access rules as the employee dashboard: a van only sees and changes jobs
  assigned to its tech, and can't move a cancelled job.
- Admins see and **revoke** laptops under **Admin → Van Terminals**. Tokens idle
  for 30 days stop working.
- The site must be served over **HTTPS** (the load balancer's Let's Encrypt
  certificate). The van app ships the Let's Encrypt root certificates because
  Windows XP doesn't have them.

## Inbound email webhook

`POST /api/email/inbound` accepts a JSON body
`{ from, to, subject, text, secret? }` from an email provider (Resend inbound,
SendGrid Inbound Parse, etc.). Authenticate with `INBOUND_EMAIL_SECRET` via an
`Authorization: Bearer …` header, an `x-webhook-secret` header, or a `secret`
body field. Recognized senders have their message appended to a conversation
with the company; every inbound message is recorded in `EmailLog`.

## File uploads

Customer documents and equipment manuals are stored in **DigitalOcean
Spaces** (private bucket, `SPACES_*`) so every droplet behind the load
balancer sees every file, or on the local disk (`UPLOAD_DIR`) when Spaces
isn't configured. Either way they're served only through access-controlled
routes (`/portal/documents/[id]`, `/portal/manuals/[id]`,
`/api/van/v1/manuals/:id`). `src/lib/uploads.ts` holds both backends;
`npm run storage:migrate` copies an existing `UPLOAD_DIR` into Spaces.

## Project structure

```
prisma/
  schema.prisma         # data model + enums (MySQL)
  migrations/           # SQL migrations
  seed.ts               # demo data
src/                    # the app: website + portal + van API (Next.js)
  app/
    page.tsx            # the public home page (quote form posts to a server action)
    login/              # sign-in, forgot/reset password
    portal/             # role dashboards, messaging, manuals, vehicles, profile
    api/
      auth/             # NextAuth route handler
      email/inbound/    # inbound email webhook
      van/v1/           # van app: login, sync, mailbox, manuals, logout
    actions/            # shared server actions (quote form, compose email)
  components/           # portal UI
  lib/                  # prisma, auth helpers, email, uploads, messaging, rate limit
  auth.ts / auth.config.ts   # NextAuth v5 (Node + edge-safe split)
  middleware.ts         # first-gate route protection
server.js               # Node entry point (PM2 cluster; also cPanel Passenger)
ecosystem.config.js     # PM2 config (2 processes, 127.0.0.1:3000)
deploy/digitalocean/    # load-balanced DigitalOcean guide, droplet setup, nginx, rolling deploy
deploy/deploy.sh        # update one droplet: pull → install → migrate → build → reload
.cpanel.yml             # cPanel Git deployment tasks
scripts/cpanel-deploy.sh# cPanel: install → migrate → build → restart
van-app/                # desktop app for the van Toughbooks (Python/Tkinter)
tests/                  # Vitest unit tests
.github/workflows/      # CI + optional cPanel auto-deploy
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: it spins up a
MySQL service, installs dependencies, generates the Prisma client, applies
migrations, runs the Vitest suite, builds the app, and runs the van app's tests
plus a Python 3.4 compatibility check. This is the automated gate that proves a
commit is deployable.

## Deploying on DigitalOcean (load-balanced)

Step-by-step: [`deploy/digitalocean/README.md`](deploy/digitalocean/README.md).
In short: Managed MySQL + Spaces + Zoho Mail; two or more Ubuntu droplets
prepared with `deploy/digitalocean/setup-droplet.sh` and sharing one `.env`;
a Load Balancer with a Let's Encrypt certificate and `/api/health` checks.
Updates roll out one droplet at a time with
`bash deploy/digitalocean/deploy-all.sh <droplet IPs>`.

## Other hosting (not used for rowanheatingandair.com)

### cPanel

The same single app runs under cPanel's *Setup Node.js App*:

1. **Database:** cPanel → *MySQL® Databases*: create a database and a user
   with **All Privileges** (cPanel prefixes names, e.g. `cpuser_rowanhvac`).
2. **Code:** *Git™ Version Control* → clone this repo (e.g. `~/rowanhvac`).
3. **`.env`** in that folder (see `.env.example`): at least `DATABASE_URL`,
   `AUTH_SECRET`, `AUTH_URL="https://rowanheatingandair.com"`, and a
   persistent `UPLOAD_DIR` outside the repo.
4. **Node app:** *Setup Node.js App* → *Create*: Node 20, Application root =
   the clone, Application URL = `rowanheatingandair.com`, startup file
   `server.js`. Then *Run NPM Install*.
5. **First deploy** (cPanel *Terminal*): `bash scripts/cpanel-deploy.sh`,
   then `npm run create-admin -- --email you@… --name "…"` once.

#### Automated cPanel redeploys

- **From cPanel:** *Git™ Version Control* → *Manage* → *Deploy HEAD Commit*.
  cPanel runs `.cpanel.yml` → `scripts/cpanel-deploy.sh` (install →
  `prisma migrate deploy` → build → restart Passenger).
- **From GitHub (push-to-deploy):** add the secrets documented in
  `.github/workflows/deploy-cpanel.yml` (`CPANEL_HOST`, `CPANEL_USER`,
  `CPANEL_API_TOKEN`, `CPANEL_REPO_ROOT`). Every push to `main` then triggers a
  cPanel deploy. Without the secrets the workflow is a harmless no-op.

### Inbound email webhook URL

Point your email provider's inbound webhook (or a cPanel pipe-to-script) at
`https://rowanheatingandair.com/api/email/inbound` with the
`INBOUND_EMAIL_SECRET`.

### Windows Server (e.g. AWS EC2 Windows)

The app runs unchanged on Windows. IIS handles the public ports + SSL and
reverse-proxies to the Node app (kept alive by PM2). Files in `deploy/windows/`
and `scripts/*.ps1` support this.

1. **Lock the IP first.** On AWS, attach an **Elastic IP** to the Windows
   instance (or the public IP changes on every reboot and the site drops). Open
   inbound **80, 443, 3389 (RDP)** in the security group. Point your DNS A record
   at the Elastic IP.
2. **Prereqs** (elevated PowerShell): `./scripts/setup-windows.ps1` installs
   Node 20, Git, and PM2 (as a startup service). Then install **MySQL Community
   Server** (MSI) and create a DB + user, and install **IIS** with the free
   **URL Rewrite** and **Application Request Routing (ARR)** modules (enable the
   proxy in ARR → Server Proxy Settings).
3. **Get the code + config**:
   ```powershell
   git clone https://github.com/Jamesrowan11/RowanHVAC.git C:\apps\rowanhvac
   cd C:\apps\rowanhvac
   # create .env with DATABASE_URL (mysql://user:pass@localhost:3306/rowanhvac),
   # AUTH_SECRET, AUTH_URL=https://yourdomain, etc.
   npm ci
   npx prisma migrate deploy
   npm run create-admin -- --email you@rowanheatingandair.com --name "Your Name"
   npm run build
   npm install -g pm2
   pm2 start server.js --name rowanhvac
   pm2 save
   ```
4. **IIS site**: create a site bound to your domain with physical path e.g.
   `C:\inetpub\rowanhvac`, and copy `deploy/windows/web.config` there. It
   forwards all traffic to the Node app on `127.0.0.1:3000`.
5. **SSL**: use **win-acme** (Let's Encrypt for IIS) to issue a cert for the
   domain, or put Cloudflare in front (Full strict) with an origin cert.
6. **Updates later**: `./scripts/deploy.ps1` (pull → migrate → build → PM2
   reload).

### Vercel

The app also deploys to Vercel (serverless): set `DATABASE_URL` (a hosted
MySQL URL), `AUTH_SECRET`, and run `npx prisma migrate deploy`. Vercel's
filesystem is ephemeral, so move uploads and manuals to object storage first
(the `src/lib/uploads.ts` interface is built for that swap).

---

This website was made and is hosted by Rowan Copy, a part of the Northvale
Unified family.
