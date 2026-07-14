import Link from "next/link";
import { requireRole } from "@/lib/guards";
import ImportCalendarForm from "@/components/portal/ImportCalendarForm";

export const metadata = { title: "Import Google Calendar" };

export default async function ImportCalendarPage() {
  await requireRole("ADMIN");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Import Google Calendar</h1>
        <Link href="/portal/calendar" className="text-sm font-medium text-accent-600 hover:underline">
          ← Calendar
        </Link>
      </div>

      <section className="card max-w-2xl text-sm text-gray-700">
        <h2 className="font-bold text-navy">Getting your calendar out of Google</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Open <strong>calendar.google.com</strong> on a computer (not the phone app).</li>
          <li>Click the gear icon → <strong>Settings</strong>.</li>
          <li>In the left sidebar under <strong>Settings for my calendars</strong>, click the company calendar.</li>
          <li>
            Choose <strong>Import &amp; export → Export</strong> — Google downloads a .zip; unzip it to
            get the <code className="rounded bg-navy-50 px-1">.ics</code> file, and upload that below.
          </li>
        </ol>
        <h2 className="mt-4 font-bold text-navy">What happens on import</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Every event becomes a calendar entry here: the event title becomes the customer name, the location becomes the address, and the description is kept as the job summary.</li>
          <li>Past events arrive as <strong>Completed</strong> (history), future ones as <strong>Scheduled</strong>.</li>
          <li>All-day events show as AM/PM; timed events keep their times.</li>
          <li>Duplicates are skipped automatically, so re-importing the same file is harmless.</li>
        </ul>
      </section>

      <ImportCalendarForm />
    </div>
  );
}
