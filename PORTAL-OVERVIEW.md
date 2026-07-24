# Rowan Heating & Air Conditioning — Website & Portal Overview

*Everything the system does, in one place. Last updated July 24, 2026.*

The site is one application with two faces: the **public website** at rowanhvac.com that customers see, and the **portal** at `/portal` where the family and staff run the business. It runs on your own AWS server (managed through Plesk), stores everything in your own database, and sends email through your own mail server as **info@rowanhvac.com**.

---

## 1. The public website

- **Homepage** — company name front and center (sized up per Jim's request), services, calls-to-action, and a **contact / quote request form** that lands directly in the portal's Requests inbox. A **service-area checker** lets visitors confirm you cover their town.
- **Our History page** (`/history`) — the story since 1958: three generations, Jim & Theresa, the next generation, NATE/ACCA certifications and Aeroseal, with a gallery of seven vintage photos. Linked from the homepage header.
- **Editable content** — admins can change homepage text, the hero image, team photos, and the service-area list from **Portal → Content** without touching code.
- **Google tracking** — if a Google Ads/Analytics tag ID is set, every page view, call click, and form submit fires as an event (used by the Analytics page below).
- **Installable app** — the site is a PWA: staff and customers can "Add to Home Screen" on their phones and it behaves like an app, including push notifications. The groundwork for publishing it to Google Play is in place too.

## 2. Accounts & roles

Three kinds of login, each seeing a different portal:

- **Admin** (Jim, Theresa, Michele…) — everything: scheduling, users, tickets, price book, exports, emails, content.
- **Employee** (technicians) — their own schedule, assigned jobs, service tickets, mailbox, and announcements.
- **Client** (customers) — their appointments, service history, requests, and billing info.

Every customer account can carry:

- **Customer ID number** — typed in at account creation (or auto-assigned on import), shown next to the name everywhere, and used to match customers in QuickBooks.
- **Billing email** — a separate address for invoices when it differs from their login email.
- **Multiple service addresses** — for contractors and landlords: one primary address plus any number of extra labeled addresses, all selectable on tickets.

**Find people fast:** the Users page has a search bar covering name, email, phone, address, and customer number.

## 3. Bringing your customers in (QuickBooks import)

Your QuickBooks customer list (4,873 rows) was converted to a ready-to-upload CSV:

- **Users → Import customers** takes the CSV and creates a client account per row.
- Rows sharing an email are **merged into one account with multiple addresses** (the contractor case) — 2,593 unique customers, 139 of them with several addresses.
- Re-running the import is safe: existing accounts are matched by email and only gain missing addresses — nothing is overwritten.
- Welcome emails are optional (recommended OFF for the bulk import).
- Customers without an email (1,633) are in a separate reference file since a login requires an email.

## 4. Scheduling & the calendar

- **Appointments are AM / PM / AM-PM arrival windows, never exact times** — exactly how you actually book. AM anchors at 8:00, PM at 1:00 for sorting; customers only ever see "July 16 (AM)".
- Jobs can be **service visits or pickups**, single-day or spanning several days.
- **Technician assignment is optional and unlimited** — assign nobody, one tech, or a whole crew at scheduling time or day-of. A free tech can also **pick up** an unassigned job or join a teammate's.
- **Calendar** — two-week grid for admins (everything) and techs (their jobs), with status colors, arrival windows on every chip, and pickup badges.
- **Calendar search** (Russell's request) — a search bar that finds any event past or future by customer, service, or address, with a one-click **Duplicate onto a new date/window** for repeat visits.
- **Reschedule / edit** (Michele's request) — admins can change the date, window, customer name, address, or service on any job. If the time moves, the client and every assigned tech automatically get "was X, now Y" notifications, and the change is logged on the job.
- **Google Calendar import** — upload a `.ics` export and your entire calendar history comes in: past events marked completed, all-day events become AM/PM windows, re-uploads never create duplicates.
- **Link the client afterwards** — appointments created before a customer has an account can be linked later; linking automatically kicks off the scheduling-letter flow.
- Jobs can be **cancelled with a reason** (client + techs notified), **reinstated**, or **permanently deleted**.
- Website **quote requests** convert to scheduled jobs in one step.

## 5. The scheduling letter & acceptance (your real letter)

Modeled exactly on your "Mr. Davison" email, and required before dispatch:

- The **master template** lives on **Price Book → Scheduling letter**. Placeholders fill in automatically for every customer: name, service address, appointment date, and the labor rates (`$199.00` first 30 minutes / `$53.00` per extra 15) pulled **live from your labor rate table** — raise your rates and every new letter updates itself.
- The letter includes all your standard language: charges restart per visit, the 9:15 a.m. lineup call, parking and clearance around the units, the "please answer the technician's call" warning, and the payment-response requirement.
- When a job or pickup is scheduled for a linked client, their **personalized letter is emailed and texted automatically**, with a link to the acceptance page.
- On the acceptance page the customer sees their letter, the full hourly rate table for both zones, and must, **by one day before the appointment**: pick how they'll pay (**check or credit card at time of service** — no answer, no dispatch, per your letter), check the agreement box, and **type their name as a signature**.
- **Per-customer customization**: every job keeps its own copy of the letter, editable right on the job page — with an optional "email the updated letter now" and a "reset to the standard letter" button.
- **Signatures are protected**: each job snapshots the exact text signed. Editing a letter after it's signed clears the signature and requires a new acceptance; editing the master template never changes letters already sent.
- The admin job page shows the live status — ✓ accepted (with signature and payment choice), ⏳ sent, or **red when past the deadline** — plus re-send and a "preview exactly what the customer sees" link. An optional service-agreement **PDF** can be attached for the customer to view.
- The office is emailed the moment a customer signs.

## 6. Talking to customers (automatic + one-tap)

**Automatic notifications** (email + text + push, throughout the job):

- Appointment scheduled → confirmation to the client, assignment notices to each tech.
- Rescheduled → old time vs. new time to client and techs.
- Work started → "our technician has started."
- Completed → summary of the work plus a **review request with your Google and Yelp links**.
- Cancelled → notice with reschedule number.

**One-tap tools on the tech's job page:**

- **Call via office line (RingCentral RingOut)** — rings the tech's phone first, then connects the customer, with the customer's caller ID showing the **office number** instead of the tech's cell, so the call doesn't get screened. Every call is logged on the job.
- **On my way** — emails and texts the customer (with optional ETA) that the tech is en route and to answer the upcoming call.
- **Ready-to-be-next?** — texts/emails the customer a link with two buttons: "come now" or "please wait," and shows their answer on the job.

**How messages go out:** email through your own mail server as info@rowanhvac.com (AWS port 25 approved, reverse DNS set, SPF/DKIM/DMARC configured); texts through **RingCentral** from the office number; push notifications to installed phones. Every email and text ever sent is logged and viewable in the portal.

## 7. Service tickets (the field paperwork, digitized)

A phone-friendly **9-step wizard** replaces the paper ticket:

1. **Customer** — pick the client (auto-fills name/address, including choosing among a contractor's addresses) or type it in.
2. **Time** — time in / time out, zone (Local Areas or DC), number of techs, ladder used, maintenance visit.
3. **Equipment** — brand, model, serial, filter size…
4. **Readings** — temps, pressures, refrigerant added (by the pound), amp draws…
5. **Work performed** — what was done.
6. **Parts** — picked from the Price Book (each / per-pound), priced automatically.
7. **Photos** — camera or gallery, multiple at once, auto-compressed for slow connections; bulk import supported.
8. **Billing** — billable / no charge / needs office review, plus **"paid on the spot"** (Russell's request) with a payment note.
9. **Review & submit** — the whole ticket with the computed price.

**Pricing is your real price sheet, automated:** time on site rounds **up** to 15-minute brackets (30-minute minimum), priced from the zone × bracket table ($199 first 30 min, +$53 per 15; DC +$50), doubled for two techs (or per-row override), +$50 ladder, $489 flat maintenance visits, parts added on. Anything over 6 hours or missing information is flagged **for manual pricing instead of guessing**.

- Tickets start from a job (pre-filled) or standalone; drafts save per-step so a dead spot in a basement loses nothing.
- On submit, prices are **frozen** — later price book changes never alter a submitted ticket.
- Admins can review, adjust line items, reopen, or delete tickets; ticket numbers run sequentially like your paper pads.
- Tickets are linked under their calendar job, visible to office and tech.

## 8. Price Book (Portal → Price Book)

Everything money-related is editable here — no code changes ever needed:

- **Labor rate tables** by zone and time bracket, with per-row two-tech overrides; add new zones or brackets any time.
- **Rules** — ladder fee, maintenance flat rate, two-tech multiplier, rounding, minimum, and table maximum.
- **Parts & materials** — name, part number, price, each/per-pound; deactivate seasonal items without deleting history.
- **The scheduling-letter template** (see §5) with its placeholder reference.

## 9. QuickBooks Desktop export

**Portal → Tickets → Export** turns each day's submitted tickets into your bookkeeping:

- **IIF file** that QuickBooks Desktop imports directly as invoices — one invoice per ticket with labor, add-ons, and parts as line items, the customer matched by name, the service address on the bill-to, and the memo carrying the customer number, work summary, **PAID ON SITE** flags, and needs-review flags.
- The **A/R and income account names are editable on the export page** so they match your company file exactly (that's what fixed the "Account does not exist" import error).
- A **CSV** of the same data for spreadsheets/records, and a **sample IIF** for safe testing.
- Exported tickets are stamped so nothing is double-exported; re-export is available when needed.

## 10. Installation proposals

**Portal → Proposals** — the proposal document, digitized:

- Fill in customer, address, scope of work, price ("for the sum of…"), payment terms, and notes with a **live document preview** as you type.
- The document carries your letterhead, submitted-to / work-at boxes, and signature & acceptance lines.
- **Print / save as PDF** from a clean print view; assign to a client so it's tied to their account.

## 11. Email system

- **Outbound automated mail** sends from your own server as info@rowanhvac.com (Amazon SES relay removed; DNS authentication in place).
- **Emails tab (admin)** — one place for: **mailbox accounts** (create/delete real @rowanhvac.com mailboxes and set forwarding through Plesk without logging into Plesk), the **company email signature** used on all automated mail, **sent-email history**, and **unmatched inbound mail**.
- **My Mailbox** — staff connect their real @rowanhvac.com mailbox and read/send it inside the portal (top-level nav item). Mailbox access is **many-to-many**: one mailbox can be shared by several people (e.g. info@), and one person can have several mailboxes, each in its own tab. Passwords are encrypted at rest.
- **Announcements** — company-wide notices from admins that staff see in the portal.
- **Internal messages** — private threads between portal users, deletable.
- **Job & customer notes** — timestamped internal notes (with photo attachments) on every job and every customer, never visible to clients; deletable by admins or the author.

## 12. Analytics

**Portal → Analytics** — website activity from the Google tag and the site's own tracking: page views, quote-form submissions, and call clicks, so you can see what the website is actually bringing in.

## 13. Under the hood

- **Stack:** Next.js 15 + React, Prisma ORM, MariaDB — all running on your AWS EC2 server managed by Plesk, deployed via git.
- **Security:** passwords hashed, role checks on every page **and** every action on the server, customer-facing links (accept/confirm) use unguessable one-time tokens, mailbox credentials encrypted, file uploads served through access-checked routes.
- **Degrades gracefully:** if an outside service (SMS, email, calling, push) isn't configured, the action logs to the server console instead of crashing — the portal always keeps working.
- **Deploying an update:**
  1. `git pull … && npm install && npm run deploy` (as the subscription user)
  2. `touch tmp/restart.txt`
  Database changes ship as migrations that run automatically during deploy.

## 14. Open items (as of July 24, 2026)

1. **Deploy the latest commits** (scheduling letter + RingOut) with the usual two commands.
2. **RingCentral console:** enable the **RingOut** permission on your app so office-line calling works; each tech needs their cell number in My Profile.
3. **Outbound mail:** confirm the sender_relay fix worked (send a test to Gmail, then check the score at mail-tester.com).
4. **QuickBooks:** enter your exact A/R and income account names on the export page and re-test with the sample IIF.
5. **Customer import:** upload `rowan-customers-import.csv` via Users → Import customers (welcome emails off).
6. **Optional:** the letter template still says the technician calls "from his cell phone" — with RingOut, calls now show the office number; tweak that paragraph on Price Book → Scheduling letter if you want.
7. **Undecided:** the "draft with AI" button (Claude API) for rewriting letters and proposals — say the word and it goes in.
