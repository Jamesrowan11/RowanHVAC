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
(gitignored). All filesystem access goes through `src/lib/storage.ts` — to
move to cloud storage (S3, Vercel Blob), reimplement that one module.

> **Note for serverless hosting (Vercel):** the filesystem there is ephemeral,
> so uploaded files won't persist between deployments/instances. For
> production uploads on Vercel, swap `storage.ts` to Vercel Blob — the rest of
> the app needs no changes.

## Deploying to Vercel

1. **Create a Postgres database** (Vercel Postgres / Neon / Supabase) and copy
   its connection string.
2. **Import the GitHub repo** at vercel.com → Add New → Project. Next.js is
   auto-detected; the `vercel-build` script runs `prisma migrate deploy`
   automatically on every deploy.
3. **Set environment variables** (Project → Settings → Environment Variables):
   `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL=https://rowanhvac.com`,
   `APP_URL=https://rowanhvac.com`, `EMAIL_FROM`, `RESEND_API_KEY` (when
   ready), `INBOUND_WEBHOOK_SECRET`.
4. **Deploy**, then seed once from your machine:
   ```bash
   DATABASE_URL="<hosted connection string>" npm run db:seed
   ```
5. **Connect the domain** (Project → Settings → Domains → add
   `rowanhvac.com` and `www.rowanhvac.com`), then at GoDaddy → DNS:

   | Type  | Name | Value                   |
   | ----- | ---- | ----------------------- |
   | A     | `@`  | `76.76.21.21`           |
   | CNAME | `www`| `cname.vercel-dns.com`  |

   (Vercel shows these same records on the Domains page — use whatever it
   displays if they differ. Remove GoDaddy's default parked A record.)
   Certificates are issued automatically once DNS propagates.
