import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding Rowan Heating & Air Conditioning database…");

  // Clean slate (safe for a demo seed).
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.jobNote.deleteMany();
  await prisma.job.deleteMany();
  await prisma.document.deleteMany();
  await prisma.paymentLink.deleteMany();
  await prisma.maintenancePolicy.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.request.deleteMany();
  await prisma.user.deleteMany();

  // ---- Users ----
  const admin = await prisma.user.create({
    data: {
      name: "Teresa Rowan",
      email: "admin@rowanhvac.com",
      phone: "410-531-0008",
      role: "ADMIN",
      passwordHash: await hash("Password123!"),
    },
  });

  const employee = await prisma.user.create({
    data: {
      name: "Jake Miller",
      email: "tech@rowanhvac.com",
      phone: "410-555-0142",
      role: "EMPLOYEE",
      passwordHash: await hash("Password123!"),
    },
  });

  const employee2 = await prisma.user.create({
    data: {
      name: "Dean Carter",
      email: "dean@rowanhvac.com",
      phone: "410-555-0177",
      role: "EMPLOYEE",
      passwordHash: await hash("Password123!"),
    },
  });

  const client = await prisma.user.create({
    data: {
      name: "Marcia White",
      email: "client@example.com",
      phone: "301-555-0199",
      role: "CLIENT",
      passwordHash: await hash("Password123!"),
    },
  });

  const client2 = await prisma.user.create({
    data: {
      name: "John Duncan",
      email: "john@example.com",
      phone: "301-555-0123",
      role: "CLIENT",
      passwordHash: await hash("Password123!"),
    },
  });

  console.log("Created users (admin / employee / client).");

  // ---- Maintenance policy (client has an active one) ----
  await prisma.maintenancePolicy.create({
    data: { clientId: client.id, active: true, renewalDate: daysFromNow(120) },
  });

  // ---- Requests (from the website + portal) ----
  await prisma.request.createMany({
    data: [
      {
        type: "QUOTE",
        status: "NEW",
        name: "Ebony Qualls",
        phone: "202-555-0188",
        email: "ebony@example.com",
        serviceNeeded: "Heating / Furnace",
        message: "Furnace stopped working — would love a quote on repair.",
      },
      {
        type: "QUOTE",
        status: "REVIEWED",
        name: "Sam Patel",
        phone: "410-555-0211",
        email: "sam@example.com",
        serviceNeeded: "Air Conditioning",
        message: "Looking to install central A/C this spring.",
      },
      {
        type: "SERVICE",
        status: "NEW",
        name: "Marcia White",
        phone: "301-555-0199",
        email: "client@example.com",
        clientId: client.id,
        serviceNeeded: "Maintenance / Service Agreement",
        message: "Annual check-up before summer, please.",
      },
    ],
  });

  // ---- Jobs ----
  const job1 = await prisma.job.create({
    data: {
      customerName: "Marcia White",
      address: "12 Highland Ridge Rd, Highland, MD 20777",
      serviceNeeded: "A/C repair — not cooling",
      scheduledDate: daysFromNow(1),
      scheduledTime: "9:00 AM",
      status: "SCHEDULED",
      technicianId: employee.id,
      clientId: client.id,
    },
  });

  const job2 = await prisma.job.create({
    data: {
      customerName: "John Duncan",
      address: "88 Maple Lawn Blvd, Fulton, MD 20759",
      serviceNeeded: "Furnace seasonal service",
      scheduledDate: daysFromNow(-7),
      scheduledTime: "1:00 PM",
      status: "COMPLETED",
      summary: "Cleaned burners, replaced filter, verified safe operation.",
      technicianId: employee.id,
      clientId: client2.id,
    },
  });

  const job3 = await prisma.job.create({
    data: {
      customerName: "Marcia White",
      address: "12 Highland Ridge Rd, Highland, MD 20777",
      serviceNeeded: "Thermostat upgrade",
      scheduledDate: daysFromNow(3),
      scheduledTime: "11:00 AM",
      status: "IN_PROGRESS",
      technicianId: employee2.id,
      clientId: client.id,
    },
  });

  // A cancelled job (kept in DB, shows as Cancelled in client history).
  await prisma.job.create({
    data: {
      customerName: "John Duncan",
      address: "88 Maple Lawn Blvd, Fulton, MD 20759",
      serviceNeeded: "Duct inspection",
      scheduledDate: daysFromNow(-2),
      scheduledTime: "3:00 PM",
      status: "CANCELLED",
      cancelReason: "Customer rescheduled for next month.",
      technicianId: employee.id,
      clientId: client2.id,
    },
  });

  // Job notes (internal).
  await prisma.jobNote.createMany({
    data: [
      {
        jobId: job2.id,
        authorId: employee.id,
        body: "Static pressure within range. Recommended filter swap every 3 months.",
      },
      {
        jobId: job3.id,
        authorId: employee2.id,
        body: "Old thermostat removed; awaiting customer's wifi password for setup.",
      },
    ],
  });

  console.log("Created jobs and notes.");

  // ---- Payment link & document ----
  await prisma.paymentLink.create({
    data: {
      clientId: client2.id,
      createdById: admin.id,
      url: "https://example.com/pay/inv-1024",
      label: "Invoice #1024 — Furnace service",
      amount: "$189.00",
      status: "SENT",
    },
  });

  // ---- Announcement ----
  await prisma.announcement.create({
    data: {
      title: "Summer schedule",
      body: "Reminder: we're entering peak cooling season. Please confirm your assigned jobs each morning and keep notes up to date.",
      authorId: admin.id,
    },
  });

  // ---- Sample sent email (recorded with sender) ----
  await prisma.emailLog.create({
    data: {
      senderUserId: admin.id,
      to: "client@example.com",
      subject: "Your appointment is confirmed",
      body: "Hi Marcia,\n\nThis confirms your A/C repair visit tomorrow at 9:00 AM. See you then!\n\n—\nRowan Heating & Air Conditioning",
      status: "LOGGED",
      direction: "OUTBOUND",
    },
  });

  // ---- A message thread (client <-> admin) ----
  const convo = await prisma.conversation.create({
    data: {
      subject: "Question about my A/C visit",
      participants: {
        create: [
          { userId: client.id, lastReadAt: new Date() },
          { userId: admin.id },
        ],
      },
    },
  });
  await prisma.message.create({
    data: {
      conversationId: convo.id,
      senderId: client.id,
      body: "Hi! Will the technician be able to check my upstairs unit too while he's here?",
    },
  });
  await prisma.message.create({
    data: {
      conversationId: convo.id,
      senderId: admin.id,
      body: "Absolutely, Marcia — Jake will take a look at both units. See you tomorrow!",
    },
  });

  console.log("Created announcement, sample email, and a message thread.");
  console.log("\nDemo accounts (password for all: Password123!):");
  console.log("  ADMIN     admin@rowanhvac.com");
  console.log("  EMPLOYEE  tech@rowanhvac.com");
  console.log("  CLIENT    client@example.com");
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
