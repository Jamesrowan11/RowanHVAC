# Rowan Heating & Air Conditioning

A full-stack web application for **Rowan Heating & Air Conditioning** — a
family-owned HVAC company serving Highland, Fulton, and Howard County, Maryland
since 1958.

It has two parts behind one codebase:

- **(A) Public marketing website** — a single scrolling page with hero,
  services, "why choose us", service area, real customer reviews, a contact /
  quote form that saves to the database, and a footer. SEO-optimized with
  Open Graph tags and `HVACBusiness` JSON-LD (founding date 1958).
- **(B) A role-based portal** — one login, three roles (`CLIENT`, `EMPLOYEE`,
  `ADMIN`), each with its own dashboard, plus in-app messaging, document/payment
  sharing, and a pluggable email layer.

## Tech stack

- **Next.js (App Router)** + React + TypeScript
- **Tailwind CSS** (navy `#1a2b4a` primary, warm-orange `#f57c1f` accent)
- **Prisma ORM** + **PostgreSQL** (drop in any hosted connection string)
- **Auth.js / NextAuth v5** — email + password, bcrypt-hashed, JWT sessions
- **Resend** for transactional email (optional — falls back to console logging)

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
- A PostgreSQL database (local or hosted: Vercel Postgres, Neon, Supabase, …)

## Setup

```bash
# 1. Install dependencies (also runs `prisma generate`)
npm install

# 2. Create your environment file
cp .env.example .env
#    then edit .env — at minimum set DATABASE_URL and AUTH_SECRET
#    generate a secret:  openssl rand -base64 32

# 3. Create the database schema (runs the included migrations)
npx prisma migrate deploy
#    (for local development you can use:  npx prisma migrate dev)

# 4. Seed demo data (accounts, jobs, threads, a sample sent email, etc.)
npm run db:seed

# 5. Run it
npm run dev
#    open http://localhost:3000   (portal login at /login)
```

### Environment variables

| Variable                | Required | Purpose                                                              |
| ----------------------- | :------: | -------------------------------------------------------------------- |
| `DATABASE_URL`          |   yes    | PostgreSQL connection string.                                        |
| `AUTH_SECRET`           |   yes    | Secret used to sign session JWTs.                                    |
| `EMAIL_FROM`            |    no    | From-address for outgoing email. Defaults to the company address.    |
| `RESEND_API_KEY`        |    no    | If set, email sends via Resend. If unset, email is logged to console.|
| `UPLOAD_DIR`            |    no    | Local directory for uploaded documents (default `uploads`).          |
| `INBOUND_EMAIL_SECRET`  |    no    | Shared secret required by the inbound-email webhook.                 |

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
  schema.prisma        # data model + enums
  migrations/          # SQL migrations
  seed.ts              # demo data
src/
  app/
    page.tsx           # public marketing site
    login/             # auth pages + action
    portal/            # role dashboards, messaging, profile, document route
    api/
      auth/            # NextAuth route handler
      email/inbound/   # inbound email webhook
    actions/           # shared server actions (public form, compose email)
  components/           # UI (public + portal)
  lib/                  # prisma, auth helpers, email, uploads, messaging
  auth.ts / auth.config.ts   # NextAuth v5 (Node + edge-safe split)
  middleware.ts         # first-gate route protection
server.js               # Passenger entry point for cPanel
.cpanel.yml             # cPanel Git deployment tasks
scripts/cpanel-deploy.sh# install → migrate → build → restart
tests/                  # Vitest unit tests
.github/workflows/      # CI + optional cPanel auto-deploy
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: it spins up a
PostgreSQL service, installs dependencies, generates the Prisma client, applies
migrations, runs the Vitest suite, and builds the app. This is the automated
gate that proves a commit is deployable.

## Deploying to cPanel (recommended for this project)

cPanel runs the app as a long-lived Node process behind Phusion Passenger and
keeps a persistent filesystem — ideal here because uploaded documents live on
disk. The repo ships everything needed for a **fully automated** pipeline:
`server.js` (Passenger entry), `.cpanel.yml` (deploy tasks),
`scripts/cpanel-deploy.sh`, and an optional GitHub Action that triggers a deploy
on every push to `main`.

### One-time setup

1. **Create the database** — cPanel → *PostgreSQL Databases*: create a database
   and a user, add the user to the database with all privileges. Note the name
   (cPanel prefixes it, e.g. `cpuser_rowanhvac`).
2. **Clone the repo** — cPanel → *Git™ Version Control* → *Create*: clone this
   GitHub repo to a path like `/home/cpuser/rowanhvac`. (This checkout doubles
   as the app's Application Root, so deploys build in place.)
3. **Create the `.env`** — in that directory create `.env` (it is git-ignored):
   ```
   DATABASE_URL="postgresql://cpuser_dbuser:PASSWORD@localhost:5432/cpuser_rowanhvac?schema=public"
   AUTH_SECRET="<openssl rand -base64 32>"
   EMAIL_FROM="Rowan Heating & Air Conditioning <info@rowanhvac.com>"
   RESEND_API_KEY=""               # optional
   UPLOAD_DIR="/home/cpuser/rowanhvac-uploads"   # persistent, outside the repo
   INBOUND_EMAIL_SECRET="<random>"
   ```
4. **Set up the Node app** — cPanel → *Setup Node.js App* → *Create*:
   - Node.js version: 20 (or 18+)
   - Application root: the clone path from step 2
   - Application URL: your domain/subdomain
   - **Application startup file:** `server.js`
   Click *Create*, then *Run NPM Install*.
5. **First deploy** — from a terminal (cPanel → *Terminal* or SSH):
   ```bash
   cd ~/rowanhvac
   bash scripts/cpanel-deploy.sh   # installs, migrates, builds, restarts
   npm run db:seed                 # optional: load demo data the first time
   ```
   Then open your domain. The portal login is at `/login`.

### Automated redeploys

- **From cPanel:** *Git™ Version Control* → *Manage* → *Pull or Deploy* →
  *Deploy HEAD Commit*. cPanel runs `.cpanel.yml`, which calls
  `scripts/cpanel-deploy.sh` (install → `prisma migrate deploy` → build →
  restart Passenger via `tmp/restart.txt`).
- **From GitHub (push-to-deploy):** add the secrets documented in
  `.github/workflows/deploy-cpanel.yml` (`CPANEL_HOST`, `CPANEL_USER`,
  `CPANEL_API_TOKEN`, `CPANEL_REPO_ROOT`). Once set, every push to `main`
  triggers cPanel to pull and deploy automatically. Without the secrets the
  workflow is a harmless no-op.

### Inbound email on cPanel

Point your email provider's inbound webhook (or a cPanel pipe-to-script) at
`https://yourdomain/api/email/inbound` with the `INBOUND_EMAIL_SECRET`.

## Deploying to Vercel

The app also deploys to Vercel unchanged (serverless). Note that Vercel's
filesystem is ephemeral, so document uploads should be moved to object storage
(the `src/lib/uploads.ts` interface is built for that swap).

1. Import the repo into Vercel.
2. Set `DATABASE_URL` (a hosted Postgres URL) and `AUTH_SECRET` (and optionally
   `RESEND_API_KEY`, `EMAIL_FROM`, `INBOUND_EMAIL_SECRET`).
3. The `build` script runs `prisma generate`. Run `npx prisma migrate deploy`
   against your database, then deploy.

---

This website was made and is hosted by Rowan Copy, a part of the Northvale
Unified family.
