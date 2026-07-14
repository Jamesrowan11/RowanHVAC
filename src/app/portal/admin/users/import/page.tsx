import Link from "next/link";
import { requireRole } from "@/lib/guards";
import ImportClientsForm from "@/components/portal/ImportClientsForm";

export const metadata = { title: "Import Customers" };

export default async function ImportCustomersPage() {
  await requireRole("ADMIN");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Import customers</h1>
        <Link href="/portal/admin/users" className="text-sm font-medium text-accent-600 hover:underline">
          ← Users &amp; Accounts
        </Link>
      </div>

      <section className="card max-w-2xl text-sm text-gray-700">
        <h2 className="font-bold text-navy">How it works</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Upload a CSV with a header row. Recognized columns:{" "}
            <code className="rounded bg-navy-50 px-1">Name</code>,{" "}
            <code className="rounded bg-navy-50 px-1">Email</code> (both required),{" "}
            <code className="rounded bg-navy-50 px-1">Phone</code>,{" "}
            <code className="rounded bg-navy-50 px-1">Address</code>,{" "}
            <code className="rounded bg-navy-50 px-1">Customer Number</code>,{" "}
            <code className="rounded bg-navy-50 px-1">Billing Email</code>. Extra columns are ignored,
            and QuickBooks/Excel exports with those headers work as-is.
          </li>
          <li>
            An <code className="rounded bg-navy-50 px-1">Other Addresses</code> column is also recognized —
            separate several addresses with a <code className="rounded bg-navy-50 px-1">|</code> character.
          </li>
          <li>
            Each row becomes a client portal account. <strong>The same email appearing more than
            once merges into one account</strong> (all the addresses end up on file, nothing is
            overwritten) — contractors with many properties become one login.
          </li>
          <li>Customer numbers come from the file when present (and not taken); otherwise the next number is assigned automatically.</li>
          <li>
            Accounts are created <strong>without a usable password</strong> — when a customer wants
            portal access, open their page under Users and set one.
          </li>
        </ul>
      </section>

      <ImportClientsForm />
    </div>
  );
}
