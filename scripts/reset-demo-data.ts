/**
 * One-time pre-launch cleanup: removes ONLY the exact demo/seed data created
 * by prisma/seed.ts, so the live site starts clean for real customers.
 *
 * This is a deliberate, narrow exception to the app's normal rule of never
 * hard-deleting jobs (cancelled jobs are otherwise always kept for client
 * history) — it only touches rows that match the seed script's known,
 * distinctive content, so it cannot catch anything a real user created.
 *
 * Usage:
 *   npx tsx scripts/reset-demo-data.ts            # dry run — shows what would be removed
 *   npx tsx scripts/reset-demo-data.ts --confirm   # actually deletes
 *
 * Set REMOVE_DEMO_TECHS=true below if Jake/Dean are just placeholders and not
 * your real technicians. Leave it false to keep those two accounts (their
 * passwords still need resetting to something real — see README).
 */
import { PrismaClient } from "@prisma/client";

const REMOVE_DEMO_TECHS = false; // set true only if jake@/dean@rowanhvac.com are NOT real staff

const db = new PrismaClient();
const DRY_RUN = !process.argv.includes("--confirm");

async function main() {
  console.log(DRY_RUN ? "DRY RUN — nothing will be deleted. Re-run with --confirm to apply.\n" : "LIVE RUN — deleting now.\n");

  const demoClientEmails = ["client@example.com", "john@example.com"];
  const demoTechEmails = ["jake@rowanhvac.com", "dean@rowanhvac.com"];

  const demoClients = await db.user.findMany({ where: { email: { in: demoClientEmails } } });
  const demoTechs = REMOVE_DEMO_TECHS
    ? await db.user.findMany({ where: { email: { in: demoTechEmails } } })
    : [];

  const demoClientIds = demoClients.map((u) => u.id);
  const demoTechIds = demoTechs.map((u) => u.id);

  // Jobs: everything tied to a demo client, plus the one seeded Pickup job
  // (matched by its distinctive, seed-only content — no client attached).
  const jobs = await db.job.findMany({
    where: {
      OR: [
        ...(demoClientIds.length ? [{ clientId: { in: demoClientIds } }] : []),
        { kind: "PICKUP", customerName: "Supply House — Capitol" },
      ],
    },
  });

  // Threads: the two seeded conversations, matched by their exact seed subjects.
  const threads = await db.thread.findMany({
    where: { subject: { in: ["Question about my upcoming tune-up", "Truck 2 inventory"] } },
  });

  const requests = await db.quoteRequest.findMany({
    where: {
      OR: [
        { name: "Ebony Qualls", email: "ebony@example.com" },
        ...(demoClientIds.length ? [{ clientId: { in: demoClientIds } }] : []),
      ],
    },
  });

  const announcements = await db.announcement.findMany({
    where: { title: "Summer scheduling starts next week" },
  });

  const paymentLinks = await db.paymentLink.findMany({
    where: { url: "https://pay.example.com/invoice/1042" },
  });

  const unmatched = await db.unmatchedInbound.findMany({
    where: { fromAddress: "stranger@example.net" },
  });

  const sampleEmailLogs = await db.emailLog.findMany({
    where: { subject: "Welcome to the Rowan Heating & Air portal" },
  });

  console.log(`Jobs to remove: ${jobs.length}`);
  jobs.forEach((j) => console.log(`  - ${j.customerName} · ${j.service}`));
  console.log(`Message threads to remove: ${threads.length}`);
  threads.forEach((t) => console.log(`  - ${t.subject}`));
  console.log(`Quote requests to remove: ${requests.length}`);
  console.log(`Announcements to remove: ${announcements.length}`);
  console.log(`Payment links to remove: ${paymentLinks.length}`);
  console.log(`Unmatched inbound entries to remove: ${unmatched.length}`);
  console.log(`Sample sent emails to remove: ${sampleEmailLogs.length}`);
  console.log(`Demo client accounts to remove: ${demoClients.map((u) => u.email).join(", ") || "(none)"}`);
  console.log(`Demo tech accounts to remove: ${demoTechs.map((u) => u.email).join(", ") || "(none — kept)"}`);
  console.log("Admin account: never touched by this script.\n");

  if (DRY_RUN) {
    console.log("Nothing deleted. Re-run with --confirm to apply the above.");
    return;
  }

  // Order matters: jobs/threads (which reference the demo users) first, then
  // the users themselves last, so no foreign-key constraint ever blocks us.
  if (jobs.length) await db.job.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
  if (threads.length) await db.thread.deleteMany({ where: { id: { in: threads.map((t) => t.id) } } });
  if (requests.length) await db.quoteRequest.deleteMany({ where: { id: { in: requests.map((r) => r.id) } } });
  if (announcements.length) await db.announcement.deleteMany({ where: { id: { in: announcements.map((a) => a.id) } } });
  if (paymentLinks.length) await db.paymentLink.deleteMany({ where: { id: { in: paymentLinks.map((p) => p.id) } } });
  if (unmatched.length) await db.unmatchedInbound.deleteMany({ where: { id: { in: unmatched.map((u) => u.id) } } });
  if (sampleEmailLogs.length) await db.emailLog.deleteMany({ where: { id: { in: sampleEmailLogs.map((e) => e.id) } } });
  if (demoClientIds.length) await db.user.deleteMany({ where: { id: { in: demoClientIds } } });
  if (demoTechIds.length) await db.user.deleteMany({ where: { id: { in: demoTechIds } } });

  console.log("Done — demo data removed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
