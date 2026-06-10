# Rowan Heating & Air Conditioning — Website + Portal

Full-stack app for Rowan Heating & Air Conditioning (family-owned in Highland /
Fulton, Maryland since 1958):

- **Public marketing site** at `/` — services, reviews, service area, Meet Our
  Techs, and a quote form that saves straight to the admin dashboard.
- **Portal** at `/portal` behind one login (`/login`) with three roles:
  **ADMIN** (requests, scheduling, users, payments & documents, email,
  announcements, signature, unmatched inbox, public team page),
  **EMPLOYEE** (assigned schedule, job status & notes, email to clients,
  announcements), and **CLIENT** (appointments, requests, maintenance
  scheduling, service history, documents & payments).
- **In-app messaging** with unread badges, email notifications, and an inbound
  email webhook.

## Tech stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · Prisma ·
PostgreSQL · Auth.js v5 (credentials + JWT) · bcrypt · Resend (optional).

## Local setup

Prereqs: Node 20+, a PostgreSQL database (any local or hosted instance).

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
#    → set DATABASE_URL to your Postgres connection string
#    → set AUTH_SECRET (openssl rand -base64 32)

# 3. Create the schema
npx prisma migrate deploy        # (or `npx prisma migrate dev` while developing)

# 4. Seed demo data
npm run db:seed

# 5. Run
npm run dev                      # http://localhost:3000
```

### Demo accounts (from the seed)

| Role     | Email                | Password          | Notes                          |
| -------- | -------------------- | ----------------- | ------------------------------ |
| ADMIN    | admin@rowanhvac.com  | `RowanAdmin123!`  | Teresa Rowan                   |
| EMPLOYEE | jake@rowanhvac.com   | `RowanTech123!`   | Has assigned jobs              |
| EMPLOYEE | dean@rowanhvac.com   | `RowanTech123!`   | Has assigned jobs              |
| CLIENT   | client@example.com   | `RowanClient123!` | Active maintenance policy      |
| CLIENT   | john@example.com     | `RowanClient123!` | No policy                      |

The seed also creates sample quote requests, jobs in every status (including a
cancelled one), job notes, message threads, an announcement, a paid payment
link, internal notes, an unmatched inbound email, and a sample sent email.

## Environment variables

| Variable                 | Purpose                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`           | PostgreSQL connection string                                                                      |
| `AUTH_SECRET`            | Auth.js JWT signing secret (`openssl rand -base64 32`)                                            |
| `NEXTAUTH_URL`           | Public URL of the app (e.g. `https://rowanhvac.com`)                                              |
| `APP_URL`                | Same URL — used for links inside emails                                                            |
| `RESEND_API_KEY`         | Optional. If unset, every email is printed to the console instead (the app runs fully without it) |
| `EMAIL_FROM`             | e.g. `Rowan Heating & Air <info@rowanhvac.com>`                                                    |
| `INBOUND_WEBHOOK_SECRET` | Shared secret for `POST /api/email/inbound`. If unset the endpoint is open (local dev only)        |

## Email layer

`src/lib/email.ts` is pluggable: with `RESEND_API_KEY` set it sends real email
through Resend (plain-text + branded HTML); without it, the full email is
logged to the console. **Every** send is recorded in `EmailLog` with the
sending user, recipients, subject, body, and status — visible under
*Email → Sent Email History* (admins see everything; employees see only their
own sends). The admin-editable company signature (Portal → Signature) is
appended exactly once to every outgoing email.

### Built-in automations

- New quote/portal/maintenance request → admins emailed.
- Job created → technician emailed (and client, if linked).
- Job completed → client emailed with the work summary.
- Job cancelled / reinstated → technician (and client) emailed.
- Payment link or document shared → client emailed.
- New portal message → other participants emailed.
- Announcement posted → staff emailed.
- New account created → welcome email.

### Inbound email webhook

`POST /api/email/inbound` accepts SendGrid/Mailgun/Postmark-style JSON or form
payloads (`from`, `subject`, `text`/`TextBody`/`body-plain`…). A matched sender
is filed into their latest message thread (or a new one with the admins);
unknown senders land in the admin **Unmatched Inbox**. Protect it by setting
`INBOUND_WEBHOOK_SECRET` and sending the secret in an `x-webhook-secret` header
(or `?secret=` query param) from your email provider.

## Security model

- Sessions: JWT in an `httpOnly`/`secure`/`sameSite` cookie; ~30 min
  inactivity timeout and ~8 h absolute lifetime. No "remember me".
- Passwords: bcrypt (cost 12). Self-service password change requires the
  current password and is scoped to the session user only.
- Every page loader, server action, and API route re-checks the session user
  and role **on the server** (`src/lib/guards.ts`). Deactivated accounts lose
  access immediately.
- IDOR-safe: queries are scoped to the requesting user (e.g. employees can
  only load jobs `WHERE technicianId = me`); forged ids return 404/forbidden,
  never data. Internal job/customer/employee notes are never selected into
  client-facing pages.

## File uploads

Documents and tech photos are stored on local disk under `uploads/`
(gitignored), which persists on a normal server (AWS/Plesk). All filesystem
access goes through `src/lib/storage.ts` — to move to cloud storage (e.g.
S3), reimplement that one module. Set `UPLOAD_DIR` to relocate the folder
(e.g. outside the deploy directory so redeploys never touch it), and include
it in your backups.

## Deploying to AWS (Plesk on Ubuntu)

Target: an EC2 Ubuntu instance running Plesk, domain `rowanhvac.com` at
GoDaddy.

### 1. One-time server prep (SSH as root/ubuntu)

```bash
# PostgreSQL (skip if using AWS RDS instead)
apt update && apt install -y postgresql
sudo -u postgres psql -c "CREATE USER rowan WITH PASSWORD '<strong-password>';"
sudo -u postgres psql -c "CREATE DATABASE rowanhvac OWNER rowan;"
```

Your `DATABASE_URL` is then
`postgresql://rowan:<strong-password>@localhost:5432/rowanhvac`
(or the RDS endpoint if you went that route).

In Plesk, install these extensions if missing: **Node.js** and **Git**
(Extensions → Extensions Catalog). In AWS, make sure the instance's security
group allows inbound **80** and **443**.

### 2. Create the site in Plesk

1. **Websites & Domains → Add Domain** → `rowanhvac.com`.
2. **Git** (on the domain) → clone this GitHub repo, deploy branch `main`
   into the domain's directory (e.g. `/var/www/vhosts/rowanhvac.com/httpdocs`).
3. **Node.js** (on the domain):
   - Node version: **20+**
   - Document Root: the repo folder
   - Application Startup File: **`server.js`**
   - Custom environment variables: `DATABASE_URL`, `AUTH_SECRET`
     (`openssl rand -base64 32`), `NEXTAUTH_URL=https://rowanhvac.com`,
     `APP_URL=https://rowanhvac.com`, `EMAIL_FROM`, `RESEND_API_KEY` (when
     ready), `INBOUND_WEBHOOK_SECRET`, `NODE_ENV=production`.
4. First deploy (SSH into the repo folder, or use Plesk's "Run script"):
   ```bash
   npm install
   npm run deploy      # prisma generate + migrate deploy + next build
   npm run db:seed     # first time only — then log in and change passwords
   ```
5. In Plesk Node.js, click **Restart App**. Passenger now serves the app.

   *Prefer PM2 instead of Plesk's Node.js extension?* `pm2 start
   ecosystem.config.js` and add a reverse proxy in Plesk → Apache & nginx
   Settings → Additional nginx directives:
   `location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }`

6. **SSL**: Plesk → SSL/TLS Certificates → install a free Let's Encrypt cert
   for `rowanhvac.com` + `www`, and turn on "Redirect from HTTP to HTTPS".

### 3. Point GoDaddy at the server

Use the EC2 instance's **Elastic IP** (allocate one in the AWS console so the
address survives reboots):

| Type  | Name  | Value                  |
| ----- | ----- | ---------------------- |
| A     | `@`   | `<your Elastic IP>`    |
| A     | `www` | `<your Elastic IP>`    |

Remove GoDaddy's default parked A record. Once DNS propagates, issue the
Let's Encrypt cert (step 6 above) if you couldn't before.

### 4. Updating the site later

Push to GitHub → Plesk Git "Pull Updates" (or enable its webhook for
automatic pulls) → run `npm install && npm run deploy` → Restart App.
