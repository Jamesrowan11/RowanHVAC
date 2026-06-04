# Rowan Heating & Air Conditioning

A full-stack web application for **Rowan Heating & Air Conditioning** — a
family-owned HVAC company serving Highland, Fulton, and Howard County, Maryland
since 1958.

It ships as **two deployables in one repo**, built for GoDaddy cPanel hosting on
two subdomains:

- **(A) Public marketing website** — `rowanhvac.rowancopy.com`. A statically
  exported single page (hero, services, "why choose us", service area, real
  customer reviews, a quote form, footer). Plain HTML/CSS/JS — runs on any
  GoDaddy plan with **no server**. SEO-optimized with Open Graph and
  `HVACBusiness` JSON-LD (founding date 1958). Its quote form POSTs to the
  portal's API and the submission appears in the admin dashboard. Lives in
  `public-site/`.
- **(B) Role-based portal** — `rowanhvacportal.rowancopy.com`. The login-gated
  Node.js app: one login, three roles (`CLIENT`, `EMPLOYEE`, `ADMIN`), each with
  its own dashboard, plus in-app messaging, document/payment sharing, and a
  pluggable email layer. This is the repo root.

## Tech stack

- **Next.js (App Router)** + React + TypeScript
- **Tailwind CSS** (navy `#1a2b4a` primary, warm-orange `#f57c1f` accent)
- **Prisma ORM** + **MySQL / MariaDB** (what GoDaddy cPanel provides; drop in any
  hosted connection string)
- **Auth.js / NextAuth v5** — email + password, bcrypt-hashed, JWT sessions
- **Resend** for transactional email (optional — falls back to console logging)
- The portal runs as a long-lived Node process behind **Phusion Passenger**
  (cPanel "Setup Node.js App"); the public site is a **static export**.

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

## Local setup (portal)

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
#    open http://localhost:3000   (redirects to /login)
```

## Local setup (public site)

```bash
cd public-site
npm install
cp .env.example .env.local        # point NEXT_PUBLIC_PORTAL_URL at your portal
npm run dev                        # http://localhost:3100
# or build the static export:
npm run build                      # outputs public-site/out/
```

For local testing, set the portal's `PUBLIC_SITE_ORIGIN=http://localhost:3100`
so the quote form's cross-origin POST is allowed.

### Environment variables

**Portal** (`.env` in the repo root):

| Variable               | Required | Purpose                                                               |
| ---------------------- | :------: | --------------------------------------------------------------------- |
| `DATABASE_URL`         |   yes    | MySQL connection string (`mysql://user:pass@host:3306/db`).           |
| `AUTH_SECRET`          |   yes    | Secret used to sign session JWTs.                                     |
| `AUTH_URL`             |   rec.   | The portal's URL (callback URLs behind a subdomain).                  |
| `PUBLIC_SITE_ORIGIN`   |   rec.   | Origin allowed to POST the public quote form (the marketing site).   |
| `EMAIL_FROM`           |    no    | From-address for outgoing email. Defaults to the company address.    |
| `RESEND_API_KEY`       |    no    | If set, email sends via Resend. If unset, email is logged to console.|
| `UPLOAD_DIR`           |    no    | Where uploaded documents are stored (use a persistent path on cPanel).|
| `INBOUND_EMAIL_SECRET` |    no    | Shared secret required by the inbound-email webhook.                  |

**Public site** (`public-site/.env.local`, inlined at build time):

| Variable                 | Purpose                                          |
| ------------------------ | ------------------------------------------------ |
| `NEXT_PUBLIC_PORTAL_URL` | Portal URL for the login link and quote POST.    |
| `NEXT_PUBLIC_SITE_URL`   | This site's own URL (canonical / OpenGraph).     |

The app **runs fully without an email key** — every email is recorded in the
`EmailLog` table and printed to the server console instead of being sent.

## Demo accounts

After seeding, log in at `/login`. **Password for all accounts:** `Password123!`

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

## Inbound email webhook

`POST /api/email/inbound` accepts a JSON body
`{ from, to, subject, text, secret? }` from an email provider (Resend inbound,
SendGrid Inbound Parse, etc.). Authenticate with `INBOUND_EMAIL_SECRET` via an
`Authorization: Bearer …` header, an `x-webhook-secret` header, or a `secret`
body field. Recognized senders have their message appended to a conversation
with the company; every inbound message is recorded in `EmailLog`.

## File uploads

Uploaded documents are stored on the local filesystem (`UPLOAD_DIR`, outside
`/public`) and served only through an access-controlled route
(`/portal/documents/[id]`). The storage interface (`src/lib/uploads.ts`) is a
thin store/read/delete-by-key layer, so moving to S3/GCS is a localized change.

## Project structure

```
prisma/
  schema.prisma         # data model + enums (MySQL)
  migrations/           # SQL migrations
  seed.ts               # demo data
src/                    # the PORTAL app (Node)
  app/
    page.tsx            # redirects to /login (portal is login-first)
    login/              # auth pages + action
    portal/             # role dashboards, messaging, profile, document route
    api/
      auth/             # NextAuth route handler
      email/inbound/    # inbound email webhook
      public/quote/     # CORS endpoint for the static site's quote form
    actions/            # shared server actions (compose email)
  components/           # portal UI
  lib/                  # prisma, auth helpers, email, uploads, messaging, rate limit
  auth.ts / auth.config.ts   # NextAuth v5 (Node + edge-safe split)
  middleware.ts         # first-gate route protection
public-site/            # the PUBLIC marketing site (static export)
  src/app/page.tsx      # the single marketing page
  src/components/        # Logo, Stars, ServiceIcon, fetch-based QuoteForm
server.js               # Passenger entry point for the portal on cPanel
.cpanel.yml             # cPanel Git deployment tasks (portal + optional public)
scripts/cpanel-deploy.sh# portal: install → migrate → build → restart
scripts/build-public.sh # public: build static export → copy to docroot
tests/                  # Vitest unit tests
.github/workflows/      # CI + optional cPanel auto-deploy
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: it spins up a
MySQL service, installs dependencies, generates the Prisma client, applies
migrations, runs the Vitest suite, builds the portal, **and** builds the static
public site. This is the automated gate that proves a commit is deployable.

## Deploying to GoDaddy cPanel (two subdomains)

The project is split to match GoDaddy's hosting model:

| Subdomain                       | What runs there            | How                         |
| ------------------------------- | -------------------------- | --------------------------- |
| `rowanhvac.rowancopy.com`       | Public marketing site      | Static files (no server)    |
| `rowanhvacportal.rowancopy.com` | Portal (login-gated)       | Node.js app (Passenger)     |

### 1. Database (MySQL)

cPanel → *MySQL® Databases*: create a database and a user, add the user to the
database with **All Privileges**. cPanel prefixes names, e.g.
`cpuser_rowanhvac` / `cpuser_dbuser`.

### 2. Portal — `rowanhvacportal.rowancopy.com`

1. **Subdomain:** cPanel → *Domains* → create `rowanhvacportal.rowancopy.com`.
2. **Clone the repo:** cPanel → *Git™ Version Control* → clone this repo to e.g.
   `/home/cpuser/rowanhvacportal` (this checkout is the app's Application Root).
3. **`.env`:** create `.env` in that folder (git-ignored):
   ```
   DATABASE_URL="mysql://cpuser_dbuser:PASSWORD@localhost:3306/cpuser_rowanhvac"
   AUTH_SECRET="<openssl rand -base64 32>"
   AUTH_URL="https://rowanhvacportal.rowancopy.com"
   PUBLIC_SITE_ORIGIN="https://rowanhvac.rowancopy.com"
   EMAIL_FROM="Rowan Heating & Air Conditioning <info@rowanhvac.com>"
   RESEND_API_KEY=""                              # optional
   UPLOAD_DIR="/home/cpuser/rowanhvac-uploads"    # persistent, outside the repo
   INBOUND_EMAIL_SECRET="<random>"
   ```
4. **Node app:** cPanel → *Setup Node.js App* → *Create*:
   - Node.js version 20 (or 18+)
   - Application root: the clone path
   - Application URL: `rowanhvacportal.rowancopy.com`
   - **Application startup file:** `server.js`
   Create it, then *Run NPM Install*.
5. **First deploy** (cPanel → *Terminal* or SSH):
   ```bash
   cd ~/rowanhvacportal
   bash scripts/cpanel-deploy.sh   # install, migrate, build, restart Passenger
   npm run db:seed                 # optional: load demo data the first time
   ```
   The portal is now live; visiting it redirects to `/login`.

### 3. Public site — `rowanhvac.rowancopy.com`

1. **Subdomain:** create `rowanhvac.rowancopy.com` and note its document root
   (e.g. `/home/cpuser/rowanhvac.rowancopy.com`).
2. **Build & publish the static files:**
   ```bash
   cd ~/rowanhvacportal
   PUBLIC_DEPLOY_PATH="/home/cpuser/rowanhvac.rowancopy.com" \
     NEXT_PUBLIC_PORTAL_URL="https://rowanhvacportal.rowancopy.com" \
     NEXT_PUBLIC_SITE_URL="https://rowanhvac.rowancopy.com" \
     bash scripts/build-public.sh
   ```
   This builds `public-site/out/` and copies it into the subdomain's docroot.
   (Or upload the contents of `public-site/out/` via *File Manager*.)

### Automated redeploys

- **From cPanel:** *Git™ Version Control* → *Manage* → *Deploy HEAD Commit*.
  cPanel runs `.cpanel.yml` → `scripts/cpanel-deploy.sh` (install →
  `prisma migrate deploy` → build → restart Passenger). To also rebuild and
  publish the public site in the same step, copy `deploy.config.example` to
  `deploy.config` and set `PUBLIC_DEPLOY_PATH`.
- **From GitHub (push-to-deploy):** add the secrets documented in
  `.github/workflows/deploy-cpanel.yml` (`CPANEL_HOST`, `CPANEL_USER`,
  `CPANEL_API_TOKEN`, `CPANEL_REPO_ROOT`). Every push to `main` then triggers a
  cPanel deploy. Without the secrets the workflow is a harmless no-op.

### Inbound email on cPanel

Point your email provider's inbound webhook (or a cPanel pipe-to-script) at
`https://rowanhvacportal.rowancopy.com/api/email/inbound` with the
`INBOUND_EMAIL_SECRET`.

## Deploying to Vercel (alternative)

The portal also deploys to Vercel (serverless) — set `DATABASE_URL` (a hosted
MySQL URL such as PlanetScale), `AUTH_SECRET`, and run `npx prisma migrate
deploy`. Note Vercel's filesystem is ephemeral, so move document uploads to
object storage (the `src/lib/uploads.ts` interface is built for that swap). The
public site can deploy to Vercel/Netlify or any static host.

---

This website was made and is hosted by Rowan Copy, a part of the Northvale
Unified family.
