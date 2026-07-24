"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hash } from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import { notify } from "@/lib/email";
import { COMPANY } from "@/lib/constants";

export type ImportState = {
  ok: boolean;
  error?: string;
  created?: string[];
  merged?: string[];
  skipped?: string[];
};

/** Minimal CSV parser that handles quoted fields and commas inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** Find a column by any of several header spellings. */
function col(headers: string[], ...names: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return headers.findIndex((h) => names.map(norm).includes(norm(h)));
}

const normAddr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Add addresses to a client, skipping any they already have (primary or extra). */
async function addAddresses(clientId: string, addresses: string[]): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: clientId },
    include: { extraAddresses: true },
  });
  if (!user) return 0;
  const have = new Set(
    [user.address ?? "", ...user.extraAddresses.map((a) => a.address)].map(normAddr).filter(Boolean)
  );
  let added = 0;
  for (const raw of addresses) {
    const address = raw.trim().slice(0, 400);
    if (!address || have.has(normAddr(address))) continue;
    await db.clientAddress.create({ data: { clientId, address } });
    have.add(normAddr(address));
    added++;
  }
  return added;
}

/**
 * Bulk-import customers from a CSV and create portal CLIENT accounts.
 * Columns (header names are flexible): Name, Email, Phone, Address,
 * Other Addresses (separated by " | "), Customer Number, Billing Email.
 * Name + Email required per row.
 *
 * Same email appearing more than once — in the file OR already in the
 * portal — MERGES into one account: contractors with many properties end
 * up as one login with every address on file. Identity fields (name,
 * phone) are never overwritten by a merge; only new addresses are added.
 *
 * Each new account gets a random unusable password — set a real one from
 * the customer's user page when they want portal access.
 */
export async function importClients(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await actionRole("ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file" };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "File too large (2 MB max)" };
  const sendWelcome = formData.get("sendWelcome") === "on";

  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { ok: false, error: "The file needs a header row plus at least one customer" };

  const headers = rows[0];
  const iName = col(headers, "name", "customername", "customer", "fullname");
  const iEmail = col(headers, "email", "emailaddress", "mainemail");
  const iPhone = col(headers, "phone", "phonenumber", "mainphone");
  const iAddress = col(headers, "address", "serviceaddress", "street", "billaddress");
  const iNumber = col(headers, "customernumber", "custnumber", "accountno", "accountnumber", "number", "custno");
  const iBilling = col(headers, "billingemail", "invoiceemail");
  const iOther = col(headers, "otheraddresses", "addresses", "additionaladdresses", "moreaddresses");

  if (iName < 0 || iEmail < 0) {
    return { ok: false, error: `Couldn't find "Name" and "Email" columns in the header row (found: ${headers.join(", ")})` };
  }

  const emailSchema = z.string().trim().toLowerCase().email().max(200);
  const created: string[] = [];
  const merged: string[] = [];
  const skipped: string[] = [];

  // Next auto customer number, kept in memory across the loop.
  const last = await db.user.aggregate({ _max: { customerNumber: true } });
  let nextNumber = Math.max(1000, last._max.customerNumber ?? 1000);

  for (const [idx, row] of rows.slice(1).entries()) {
    const line = idx + 2; // human row number (after header)
    const name = (row[iName] ?? "").trim().slice(0, 120);
    const emailParsed = emailSchema.safeParse(row[iEmail] ?? "");

    if (!name) { skipped.push(`Row ${line}: missing name`); continue; }
    if (!emailParsed.success) { skipped.push(`Row ${line} (${name}): invalid or missing email`); continue; }
    const email = emailParsed.data;

    const rowAddresses = [
      iAddress >= 0 ? (row[iAddress] ?? "").trim() : "",
      ...(iOther >= 0 ? (row[iOther] ?? "").split("|").map((a) => a.trim()) : []),
    ].filter(Boolean);

    // Same email = same person (contractors appear once per property in
    // QuickBooks) — merge this row's addresses into the existing account.
    const exists = await db.user.findUnique({ where: { email } });
    if (exists) {
      if (exists.role !== "CLIENT") {
        skipped.push(`Row ${line} (${name}): ${email} belongs to a staff account`);
        continue;
      }
      const added = await addAddresses(exists.id, rowAddresses);
      merged.push(`${exists.name} — ${email}: ${added > 0 ? `added ${added} address${added === 1 ? "" : "es"}` : "nothing new to add"}`);
      continue;
    }

    // Customer number: from the file if valid and free, else next in line.
    let customerNumber: number;
    const rawNum = iNumber >= 0 ? Number((row[iNumber] ?? "").replace(/[^\d]/g, "")) : NaN;
    if (Number.isInteger(rawNum) && rawNum > 0) {
      const numTaken = await db.user.findFirst({ where: { customerNumber: rawNum } });
      if (numTaken) { skipped.push(`Row ${line} (${name}): customer #${rawNum} already belongs to ${numTaken.name}`); continue; }
      customerNumber = rawNum;
      nextNumber = Math.max(nextNumber, rawNum);
    } else {
      nextNumber += 1;
      customerNumber = nextNumber;
    }

    let billingEmail: string | null = null;
    if (iBilling >= 0 && (row[iBilling] ?? "").trim()) {
      const b = emailSchema.safeParse(row[iBilling]);
      if (b.success) billingEmail = b.data;
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        phone: iPhone >= 0 ? (row[iPhone] ?? "").trim().slice(0, 30) || null : null,
        // First address is the primary; the rest become extra addresses.
        address: rowAddresses[0]?.slice(0, 300) || null,
        customerNumber,
        billingEmail,
        role: "CLIENT",
        // Random unusable password — admin sets a real one when the customer
        // wants portal access.
        passwordHash: await hash(crypto.randomBytes(32).toString("hex"), 12),
      },
    });
    const extraCount = await addAddresses(user.id, rowAddresses.slice(1));
    created.push(
      `${user.name} — ${user.email} (customer #${customerNumber}${extraCount > 0 ? `, ${extraCount + 1} addresses` : ""})`
    );

    if (sendWelcome) {
      notify({
        to: [user.email],
        subject: `Your ${COMPANY.shortName} customer portal account`,
        body: `Hi ${user.name},\n\nWe've set up an account for you on the ${COMPANY.name} customer portal, where you can see appointments, documents, and payments.\n\nTo get your login password, give us a call at ${COMPANY.phone} — then sign in at ${process.env.APP_URL || ""}/login\n\n${COMPANY.name}`,
      });
    }
  }

  revalidatePath("/portal", "layout");
  return { ok: true, created, merged, skipped };
}
