import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/portal/ui";
import { ImportForm } from "./ImportForm";
import { importCustomers, importJobs } from "./actions";

export default async function ImportPage() {
  await requireRole("ADMIN");
  return (
    <>
      <PageHeader
        title="Import"
        subtitle="Bring in customers and past or upcoming jobs from a spreadsheet or your old software."
      />

      <div className="card mb-6 p-6 text-sm text-navy-700">
        <p className="font-semibold text-navy-900">How to do it</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Export your customers and jobs from the old system, or open your spreadsheet. In Excel:{" "}
            <b>File → Save As → CSV (Comma delimited)</b>.
          </li>
          <li>Import <b>customers first</b>, then <b>jobs</b>, so jobs link to customer accounts.</li>
          <li>
            Leave <b>Test run</b> ticked the first time: you&apos;ll see what would be imported and any rows that
            need fixing. Then untick it and upload the same file again.
          </li>
          <li>Running the same file twice is safe: nothing is duplicated.</li>
        </ol>
        <p className="mt-3 text-navy-500">
          Column names don&apos;t have to match exactly. &quot;Customer&quot;, &quot;Client name&quot; or First +
          Last name columns all work, and so do dates like 4/17/2015, 2015-04-17 or April 17, 2015. Imported
          customers aren&apos;t emailed; they can open their account later with &quot;Forgot password&quot;.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ImportForm
          action={importCustomers}
          title="1. Customers"
          description={
            <>
              Columns: <b>Name</b> (or First / Last name), <b>Email</b>, Phone, Address (and City, State, ZIP).
              Customers are matched by email; existing ones only get a missing phone or address filled in.
            </>
          }
        />
        <ImportForm
          action={importJobs}
          title="2. Jobs (past and upcoming)"
          description={
            <>
              Columns: <b>Customer</b> name, <b>Date</b>, Service / description, Time, Address, Technician, Status,
              Notes / work performed, Email. Without a status, past dates come in as <b>Completed</b> and future
              ones as <b>Scheduled</b>. Technicians are matched by name or email under Users; list several in one cell ("Jake Miller, Dean Carter") to put them all on the job.
            </>
          }
          extraOption={{
            name: "createCustomers",
            label: "Also create customer accounts for job emails that aren't in the portal yet",
            defaultChecked: true,
          }}
        />
      </div>
    </>
  );
}
