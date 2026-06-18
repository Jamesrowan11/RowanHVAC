import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

const DEFAULT_SIGNATURE = `Rowan Heating & Air Conditioning
Family-owned & operated since 1958
Phone: 410-531-0008
Email: info@rowanhvac.com
Highland & Howard County, MD`;

function daysFromNow(days: number, hour = 9): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding…");

  // --- Users -----------------------------------------------------------
  const [adminHash, techHash, clientHash] = await Promise.all([
    hash("RowanAdmin123!", 12),
    hash("RowanTech123!", 12),
    hash("RowanClient123!", 12),
  ]);

  const admin = await db.user.upsert({
    where: { email: "admin@rowanhvac.com" },
    update: {},
    create: {
      name: "Teresa Rowan",
      email: "admin@rowanhvac.com",
      phone: "410-531-0008",
      role: "ADMIN",
      passwordHash: adminHash,
    },
  });

  const jake = await db.user.upsert({
    where: { email: "jake@rowanhvac.com" },
    update: {},
    create: {
      name: "Jake Rowan",
      email: "jake@rowanhvac.com",
      phone: "410-555-0101",
      role: "EMPLOYEE",
      passwordHash: techHash,
    },
  });

  const dean = await db.user.upsert({
    where: { email: "dean@rowanhvac.com" },
    update: {},
    create: {
      name: "Dean Carter",
      email: "dean@rowanhvac.com",
      phone: "410-555-0102",
      role: "EMPLOYEE",
      passwordHash: techHash,
    },
  });

  const client = await db.user.upsert({
    where: { email: "client@example.com" },
    update: {},
    create: {
      name: "Marcia White",
      email: "client@example.com",
      phone: "410-555-0201",
      address: "12345 Hall Shop Rd, Highland, MD 20777",
      role: "CLIENT",
      passwordHash: clientHash,
      policyActive: true,
      policyRenewal: daysFromNow(365),
    },
  });

  const client2 = await db.user.upsert({
    where: { email: "john@example.com" },
    update: {},
    create: {
      name: "John Duncan",
      email: "john@example.com",
      phone: "410-555-0202",
      address: "8800 Lime Kiln Rd, Fulton, MD 20759",
      role: "CLIENT",
      passwordHash: clientHash,
    },
  });

  // --- Signature ---------------------------------------------------------
  await db.setting.upsert({
    where: { key: "emailSignature" },
    update: {},
    create: { key: "emailSignature", value: DEFAULT_SIGNATURE },
  });

  // Idempotency: only seed sample records once.
  if ((await db.job.count()) > 0) {
    console.log("Sample data already present — users/signature refreshed, done.");
    return;
  }

  // --- Quote requests ------------------------------------------------------
  await db.quoteRequest.createMany({
    data: [
      {
        name: "Ebony Qualls",
        phone: "202-555-0144",
        email: "ebony@example.com",
        service: "Heating (furnace or boiler)",
        message: "My heat stopped working last night and the house is freezing. Can someone come out soon?",
        source: "PUBLIC",
      },
      {
        name: "Marcia White",
        phone: "410-555-0201",
        email: "client@example.com",
        service: "Maintenance visit (service agreement)",
        message: "Preferred time: weekday mornings\n\nReady for my spring A/C tune-up.",
        source: "MAINTENANCE",
        clientId: client.id,
      },
    ],
  });

  // --- Jobs ---------------------------------------------------------------
  const upcoming = await db.job.create({
    data: {
      customerName: client.name,
      address: client.address!,
      service: "Air Conditioning — seasonal tune-up",
      scheduledAt: daysFromNow(3, 9),
      status: "SCHEDULED",
      technicianId: jake.id,
      clientId: client.id,
    },
  });

  const inProgress = await db.job.create({
    data: {
      customerName: client2.name,
      address: client2.address!,
      service: "Heat Pump — repair",
      scheduledAt: daysFromNow(0, 13),
      status: "IN_PROGRESS",
      technicianId: dean.id,
      clientId: client2.id,
    },
  });

  // A Pickup-type item, to show the calendar's two-week view + Pickup label.
  await db.job.create({
    data: {
      customerName: "Supply House — Capitol",
      address: "Parts pickup: condenser fan motor",
      service: "Parts pickup",
      kind: "PICKUP",
      scheduledAt: daysFromNow(1, 8),
      status: "SCHEDULED",
      technicianId: dean.id,
    },
  });

  const completed = await db.job.create({
    data: {
      customerName: client.name,
      address: client.address!,
      service: "Gas furnace — no heat call",
      scheduledAt: daysFromNow(-30, 8),
      status: "COMPLETED",
      completedAt: daysFromNow(-30, 11),
      summary:
        "Replaced failed hot surface ignitor and cleaned flame sensor. System cycled three times, heating normally. Recommended fall maintenance.",
      technicianId: jake.id,
      clientId: client.id,
    },
  });

  await db.job.create({
    data: {
      customerName: client2.name,
      address: client2.address!,
      service: "Aeroseal Duct Sealing — estimate",
      scheduledAt: daysFromNow(-7, 14),
      status: "CANCELLED",
      cancelReason: "Customer asked to postpone until after their kitchen renovation.",
      cancelledAt: daysFromNow(-9),
      technicianId: dean.id,
      clientId: client2.id,
    },
  });

  await db.jobNote.createMany({
    data: [
      {
        jobId: completed.id,
        authorId: jake.id,
        body: "Ignitor resistance out of spec (open circuit). Replaced with OEM part from the truck. Flame sensor cleaned.",
      },
      {
        jobId: completed.id,
        authorId: admin.id,
        body: "Customer called to say thanks — very happy with the fast turnaround.",
      },
      {
        jobId: inProgress.id,
        authorId: dean.id,
        body: "On site. Outdoor unit fan not spinning — suspect run capacitor. Testing now.",
      },
      {
        jobId: upcoming.id,
        authorId: admin.id,
        body: "Maintenance plan visit. Customer prefers we use the side door.",
      },
    ],
  });

  // --- Internal notes -------------------------------------------------------
  await db.customerNote.create({
    data: {
      clientId: client.id,
      authorId: admin.id,
      body: "Long-time customer, maintenance plan member. Two dogs — friendly. Furnace is a 2019 Trane S9V2.",
    },
  });
  await db.employeeNote.create({
    data: {
      employeeId: dean.id,
      authorId: admin.id,
      body: "EPA 608 Universal certified. Renewal for MD journeyman license due in November.",
    },
  });

  // --- Announcement ----------------------------------------------------------
  await db.announcement.create({
    data: {
      title: "Summer scheduling starts next week",
      body: "A/C season is here — morning slots fill first, so check your schedule daily. Stock extra run capacitors on the trucks.",
      authorId: admin.id,
    },
  });

  // --- Messaging ---------------------------------------------------------------
  const thread = await db.thread.create({
    data: {
      subject: "Question about my upcoming tune-up",
      participants: {
        create: [
          { userId: client.id, lastReadAt: new Date() },
          { userId: admin.id },
        ],
      },
    },
  });
  await db.message.create({
    data: {
      threadId: thread.id,
      authorId: client.id,
      body: "Hi! For Thursday's tune-up, could the tech call when they're 30 minutes out? I'll be coming from work.",
    },
  });
  await db.message.create({
    data: {
      threadId: thread.id,
      authorId: admin.id,
      body: "Of course — I've added a note for Jake to call ahead. See you Thursday!",
    },
  });

  const staffThread = await db.thread.create({
    data: {
      subject: "Truck 2 inventory",
      participants: {
        create: [
          { userId: admin.id, lastReadAt: new Date() },
          { userId: dean.id },
        ],
      },
    },
  });
  await db.message.create({
    data: {
      threadId: staffThread.id,
      authorId: admin.id,
      body: "Dean — restock 45/5 µF capacitors on Truck 2 before Monday, we're down to one.",
    },
  });

  // --- Payments, documents, email log -------------------------------------------
  await db.paymentLink.create({
    data: {
      clientId: client.id,
      url: "https://pay.example.com/invoice/1042",
      label: "Invoice #1042 — furnace repair",
      status: "PAID",
      paidAt: daysFromNow(-25),
      createdById: admin.id,
    },
  });

  await db.emailLog.create({
    data: {
      senderUserId: admin.id,
      toAddresses: client.email,
      subject: "Welcome to the Rowan Heating & Air portal",
      body: `Hi ${client.name},\n\nThanks for being a maintenance plan member! You can see appointments, documents, and payments any time in your portal.\n\n--\n${DEFAULT_SIGNATURE}`,
      status: "LOGGED",
    },
  });

  await db.unmatchedInbound.create({
    data: {
      fromAddress: "stranger@example.net",
      subject: "Do you service Montgomery County?",
      body: "Hi, I'm just over the county line in Brookeville — do you come out this far?",
    },
  });

  console.log("Seed complete.");
  console.log("  ADMIN     admin@rowanhvac.com  / RowanAdmin123!");
  console.log("  EMPLOYEE  jake@rowanhvac.com   / RowanTech123!");
  console.log("  EMPLOYEE  dean@rowanhvac.com   / RowanTech123!");
  console.log("  CLIENT    client@example.com   / RowanClient123!  (active maintenance policy)");
  console.log("  CLIENT    john@example.com     / RowanClient123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
