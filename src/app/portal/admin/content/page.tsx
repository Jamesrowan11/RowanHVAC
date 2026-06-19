import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { getSiteContent, CONTENT_FIELDS } from "@/lib/siteContent";
import { updateSiteContent } from "@/lib/actions/content";
import ActionForm from "@/components/portal/ActionForm";

export const metadata = { title: "Website Content" };

export default async function AdminContent() {
  await requireRole("ADMIN");
  const content = await getSiteContent();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Website Content</h1>
        <p className="mt-1 text-sm text-gray-500">
          Edit the text on your public website. Changes go live as soon as you
          save. Leave a field blank to use the built-in default. Manage the
          towns in your service area on the{" "}
          <Link href="/portal/admin/content/areas" className="font-medium text-accent-600 hover:underline">
            Service Areas
          </Link>{" "}
          page.
        </p>
      </div>

      <section className="card max-w-2xl">
        <ActionForm
          action={updateSiteContent}
          submitLabel="Save changes"
          successMessage="Saved — your website is updated."
          resetOnSuccess={false}
          buttonClassName="btn-primary"
          className="space-y-4"
        >
          {CONTENT_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={f.key} className="label">{f.label}</label>
              {f.multiline ? (
                <textarea id={f.key} name={f.key} rows={3} defaultValue={content[f.key]} className="input" />
              ) : (
                <input id={f.key} name={f.key} defaultValue={content[f.key]} className="input" />
              )}
            </div>
          ))}
        </ActionForm>
      </section>

      <p className="max-w-2xl text-xs text-gray-500">
        Note: your phone, email, and address are also used in automated emails
        and the site&apos;s search-engine listing. Editing them here updates what
        visitors see on the website.
      </p>
    </div>
  );
}
