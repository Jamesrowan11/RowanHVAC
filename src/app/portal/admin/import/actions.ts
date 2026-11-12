"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import {
  CUSTOMER_COLUMNS,
  JOB_COLUMNS,
  cell,
  fullAddress,
  isEmail,
  mapColumns,
  parseCsv,
  parseDay,
  parseStatus,
  personName,
  formatTime,
} from "@/lib/csvImport";

/**
 * Bulk import from a CSV file (Excel: File → Save As → CSV). Safe to run again
 * with the same file: customers are matched by email and jobs by customer +
 * date + service, so nothing is duplicated. "Test run" reports what would
 * happen without saving anything.
 *
 * Imported customers get an account they can't sign in to until they use
 * "Forgot password" (no welcome emails are sent).
 */

export type ImportResult = {
  kind: "customers" | "jobs";
  dryRun: boolean;
  rows: number;
  lines: string[]; // summary lines, e.g. "Created 120 customers"
  problems: string[]; // rows skipped and why (first 40)
  columns: string[]; // which column was used for what
};

const MAX_BYTES = 9 * 1024 * 1024;
const MAX_ROWS = 50_000;
// Customers imported without a password: bcrypt never matches this, so the
// account can only be opened through "Forgot password".
const NO_PASSWORD = "!imported";

async function readFile(formData: FormData): Promise<{ rows: string[][]; error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { rows: [], error: "Choose a CSV file first." };
  if (file.size > MAX_BYTES) return { rows: [], error: "That file is over 9 MB. Split it into smaller files." };
  if (!/\.(csv|txt)$/i.test(file.name)) {
    return { rows: [], error: "Upload a .csv file. In Excel: File → Save As → CSV (Comma delimited)." };
  }
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { rows: [], error: "The file has no rows under the header." };
  if (rows.length > MAX_ROWS + 1) return { rows: [], error: `Up to ${MAX_ROWS.toLocaleString()} rows at a time. Split the file.` };
  return { rows };
}

function describeColumns(header: string[], map: Record<string, number | undefined>, labels: Record<string, string>) {
  return Object.entries(labels)
    .filter(([k]) => map[k] !== undefined)
    .map(([k, label]) => `${label} ← "${header[map[k]!]}"`);
}

function fail(kind: ImportResult["kind"], message: string): ImportResult {
  return { kind, dryRun: true, rows: 0, lines: [], problems: [message], columns: [] };
}

async function existingUsersByEmail(emails: string[]) {
  const out = new Map<string, { id: string; name: string; role: string; phone: string | null; address: string | null }>();
  for (let i = 0; i < emails.length; i += 1000) {
    const users = await prisma.user.findMany({
      where: { email: { in: emails.slice(i, i + 1000) } },
      select: { id: true, email: true, name: true, role: true, phone: true, address: true },
    });
    for (const u of users) out.set(u.email, u);
  }
  return out;
}

// ---------------------------------------------------------------- customers

export async function importCustomers(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  await assertRole("ADMIN");
  const dryRun = formData.get("dryRun") === "on";
  const { rows, error } = await readFile(formData);
  if (error) return fail("customers", error);
  const [header, ...data] = rows;
  const map = mapColumns(header, CUSTOMER_COLUMNS);
  if (map.name === undefined && map.firstName === undefined && map.email === undefined) {
    return fail("customers", `No name or email column found. Columns in the file: ${header.join(", ")}`);
  }

  const problems: string[] = [];
  const byEmail = new Map<string, { name: string; email: string; phone: string; address: string }>();
  const noEmail: string[] = [];
  data.forEach((row, i) => {
    const line = i + 2;
    const email = cell(row, map, "email").toLowerCase().split(/[;,\s]+/)[0] ?? "";
    const name = personName(row, map) || (email ? email.split("@")[0] : "");
    if (!name && !email) return;
    if (!email) {
      noEmail.push(name);
      return;
    }
    if (!isEmail(email)) {
      problems.push(`Row ${line}: "${email}" is not an email address (${name}).`);
      return;
    }
    const prev = byEmail.get(email);
    byEmail.set(email, {
      name: prev?.name || name,
      email,
      phone: prev?.phone || cell(row, map, "phone").slice(0, 40),
      address: prev?.address || fullAddress(row, map),
    });
  });

  const existing = await existingUsersByEmail([...byEmail.keys()]);
  const toCreate: { name: string; email: string; phone: string | null; address: string | null }[] = [];
  const toUpdate: { id: string; data: { phone?: string; address?: string } }[] = [];
  let unchanged = 0;
  for (const c of byEmail.values()) {
    const u = existing.get(c.email);
    if (!u) {
      toCreate.push({ name: c.name.slice(0, 160), email: c.email, phone: c.phone || null, address: c.address || null });
    } else if (u.role !== "CLIENT") {
      problems.push(`${c.email} belongs to a staff account (${u.name}); left as is.`);
    } else {
      // Only fill in what's missing; never overwrite what the office typed.
      const data: { phone?: string; address?: string } = {};
      if (!u.phone && c.phone) data.phone = c.phone;
      if (!u.address && c.address) data.address = c.address;
      if (Object.keys(data).length) toUpdate.push({ id: u.id, data });
      else unchanged++;
    }
  }

  if (!dryRun) {
    for (let i = 0; i < toCreate.length; i += 500) {
      await prisma.user.createMany({
        data: toCreate.slice(i, i + 500).map((c) => ({ ...c, role: "CLIENT" as const, passwordHash: NO_PASSWORD })),
        skipDuplicates: true,
      });
    }
    for (const u of toUpdate) await prisma.user.update({ where: { id: u.id }, data: u.data });
    revalidatePath("/portal/admin/users");
    revalidatePath("/portal/admin/schedule");
  }

  const verb = dryRun ? "Would" : "";
  const lines = [
    `${verb ? "Would create" : "Created"} ${toCreate.length} new customer account${toCreate.length === 1 ? "" : "s"}.`,
    `${verb ? "Would add" : "Added"} a missing phone or address to ${toUpdate.length} existing customer${toUpdate.length === 1 ? "" : "s"}.`,
    `${unchanged} already up to date.`,
  ];
  if (noEmail.length) {
    lines.push(
      `${noEmail.length} without an email were skipped (an account needs an email). Their names still appear on imported jobs.`,
    );
  }
  return {
    kind: "customers",
    dryRun,
    rows: data.length,
    lines,
    problems: problems.slice(0, 40),
    columns: describeColumns(header, map, { name: "Name", firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone", address: "Address", city: "City", state: "State", zip: "ZIP" }),
  };
}

// ---------------------------------------------------------------- jobs

const keyOf = (name: string, day: Date, service: string) =>
  `${name.trim().toLowerCase()}|${day.toISOString().slice(0, 10)}|${service.trim().toLowerCase()}`;

export async function importJobs(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  await assertRole("ADMIN");
  const dryRun = formData.get("dryRun") === "on";
  const createCustomers = formData.get("createCustomers") === "on";
  const { rows, error } = await readFile(formData);
  if (error) return fail("jobs", error);
  const [header, ...data] = rows;
  const map = mapColumns(header, JOB_COLUMNS);
  if (map.date === undefined) return fail("jobs", `No date column found. Columns in the file: ${header.join(", ")}`);
  if (map.name === undefined && map.firstName === undefined && map.email === undefined) {
    return fail("jobs", `No customer name or email column found. Columns in the file: ${header.join(", ")}`);
  }

  const staff = await prisma.user.findMany({
    where: { role: { in: ["EMPLOYEE", "ADMIN"] } },
    select: { id: true, name: true, email: true },
  });
  // Technicians by full name, email, or first name (only when no one else shares it).
  const techByKey = new Map<string, string>();
  const firstNames = new Map<string, string | null>();
  for (const s of staff) {
    techByKey.set(s.name.trim().toLowerCase(), s.id);
    techByKey.set(s.email.toLowerCase(), s.id);
    const first = s.name.trim().split(/\s+/)[0].toLowerCase();
    firstNames.set(first, firstNames.has(first) ? null : s.id);
  }
  for (const [first, id] of firstNames) if (id && !techByKey.has(first)) techByKey.set(first, id);
  const clientsByName = new Map<string, string | null>(); // null = ambiguous
  for (const c of await prisma.user.findMany({ where: { role: "CLIENT" }, select: { id: true, name: true } })) {
    const k = c.name.trim().toLowerCase();
    clientsByName.set(k, clientsByName.has(k) ? null : c.id);
  }

  type Row = {
    line: number; customerName: string; email: string; phone: string; address: string; service: string;
    day: Date; time: string; tech: string; status: string; summary: string;
  };
  const problems: string[] = [];
  const parsed: Row[] = [];
  data.forEach((row, i) => {
    const line = i + 2;
    const email = cell(row, map, "email").toLowerCase().split(/[;,\s]+/)[0] ?? "";
    const customerName = personName(row, map) || (email ? email.split("@")[0] : "");
    const rawDate = cell(row, map, "date");
    if (!customerName && !rawDate) return; // blank line
    const when = parseDay(rawDate);
    if (!when) {
      problems.push(`Row ${line}: date "${rawDate}" not understood (${customerName || "no name"}).`);
      return;
    }
    if (!customerName) {
      problems.push(`Row ${line}: no customer name.`);
      return;
    }
    const rawTime = cell(row, map, "time");
    parsed.push({
      line,
      customerName: customerName.slice(0, 160),
      email: isEmail(email) ? email : "",
      phone: cell(row, map, "phone").slice(0, 40),
      address: fullAddress(row, map),
      service: (cell(row, map, "service") || "Service visit").replace(/\s+/g, " ").slice(0, 255),
      day: when.day,
      time: rawTime ? formatTime(rawTime) : when.time || "",
      tech: cell(row, map, "technician"),
      status: cell(row, map, "status"),
      summary: cell(row, map, "summary"),
    });
  });

  // Customers: link by email (creating accounts if asked), else by an exact, unique name.
  const emails = [...new Set(parsed.map((r) => r.email).filter(Boolean))];
  const users = await existingUsersByEmail(emails);
  const newClients = new Map<string, { name: string; email: string; phone: string | null; address: string | null }>();
  if (createCustomers) {
    for (const r of parsed) {
      if (r.email && !users.has(r.email) && !newClients.has(r.email)) {
        newClients.set(r.email, { name: r.customerName.slice(0, 160), email: r.email, phone: r.phone || null, address: r.address || null });
      }
    }
    if (!dryRun && newClients.size) {
      const list = [...newClients.values()];
      for (let i = 0; i < list.length; i += 500) {
        await prisma.user.createMany({
          data: list.slice(i, i + 500).map((c) => ({ ...c, role: "CLIENT" as const, passwordHash: NO_PASSWORD })),
          skipDuplicates: true,
        });
      }
      for (const [k, v] of await existingUsersByEmail([...newClients.keys()])) users.set(k, v);
    }
  }

  // Skip jobs already in the portal (same customer, day and service), so a
  // second run of the same file adds nothing.
  const days = parsed.map((r) => r.day.getTime());
  const existingKeys = new Set<string>();
  if (parsed.length) {
    const existingJobs = await prisma.job.findMany({
      where: { scheduledDate: { gte: new Date(Math.min(...days)), lte: new Date(Math.max(...days)) } },
      select: { customerName: true, scheduledDate: true, serviceNeeded: true },
    });
    for (const j of existingJobs) existingKeys.add(keyOf(j.customerName, j.scheduledDate, j.serviceNeeded));
  }

  const unknownTechs = new Map<string, number>();
  const toCreate: Prisma.JobCreateManyInput[] = [];
  const crewRows: Prisma.JobTechnicianCreateManyInput[] = [];
  let duplicates = 0;
  let linked = 0;
  const counts = { SCHEDULED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 };
  for (const r of parsed) {
    const key = keyOf(r.customerName, r.day, r.service);
    if (existingKeys.has(key)) {
      duplicates++;
      continue;
    }
    existingKeys.add(key);
    const user = r.email ? users.get(r.email) : undefined;
    const clientId =
      user && user.role === "CLIENT" ? user.id : clientsByName.get(r.customerName.trim().toLowerCase()) ?? null;
    if (clientId) linked++;
    // Every technician named ("Jake Miller, Dean Carter" / "Jake & Dean") is on the crew.
    const id = "imp" + crypto.randomBytes(12).toString("hex");
    const crew: string[] = [];
    for (const part of r.tech.split(/[,;&/+|]| and /i).map((t) => t.trim()).filter(Boolean)) {
      const techId = techByKey.get(part.toLowerCase());
      if (techId) {
        if (!crew.includes(techId)) crew.push(techId);
      } else unknownTechs.set(part, (unknownTechs.get(part) ?? 0) + 1);
    }
    crew.forEach((userId, position) => crewRows.push({ jobId: id, userId, position }));
    const status = parseStatus(r.status, r.day);
    counts[status]++;
    toCreate.push({
      id,
      customerName: r.customerName,
      address: r.address || user?.address || "",
      serviceNeeded: r.service,
      scheduledDate: r.day,
      scheduledTime: r.time,
      status,
      summary: r.summary ? r.summary.slice(0, 5000) : null,
      cancelReason: status === "CANCELLED" ? r.status || "Cancelled (imported)" : null,
      clientId,
    });
  }

  if (!dryRun) {
    for (let i = 0; i < toCreate.length; i += 500) {
      await prisma.job.createMany({ data: toCreate.slice(i, i + 500) });
    }
    for (let i = 0; i < crewRows.length; i += 1000) {
      await prisma.jobTechnician.createMany({ data: crewRows.slice(i, i + 1000), skipDuplicates: true });
    }
    revalidatePath("/portal/admin/schedule");
    revalidatePath("/portal/admin");
    revalidatePath("/portal/admin/users");
  }

  const w = (yes: string, no: string) => (dryRun ? yes : no);
  const lines = [
    `${w("Would import", "Imported")} ${toCreate.length} job${toCreate.length === 1 ? "" : "s"}: ${counts.COMPLETED} completed, ${counts.SCHEDULED} scheduled, ${counts.IN_PROGRESS} in progress, ${counts.CANCELLED} cancelled.`,
    `${linked} linked to a customer account (they'll see them in their service history).`,
  ];
  if (createCustomers) lines.push(`${w("Would create", "Created")} ${newClients.size} new customer account${newClients.size === 1 ? "" : "s"} from the jobs' emails.`);
  if (duplicates) lines.push(`${duplicates} already in the portal, skipped.`);
  for (const [name, n] of unknownTechs) {
    problems.push(`Technician "${name}" (${n} job${n === 1 ? "" : "s"}) doesn't match anyone under Users; left off the job.`);
  }
  return {
    kind: "jobs",
    dryRun,
    rows: data.length,
    lines,
    problems: problems.slice(0, 40),
    columns: describeColumns(header, map, {
      name: "Customer", firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone",
      address: "Address", city: "City", state: "State", zip: "ZIP", service: "Service", date: "Date",
      time: "Time", technician: "Technician", status: "Status", summary: "Summary / notes",
    }),
  };
}
