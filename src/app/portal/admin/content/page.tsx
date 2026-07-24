import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { getSiteContent, getHeroImage, CONTENT_FIELDS } from "@/lib/siteContent";
import { updateSiteContent, updateHeroImage, removeHeroImage } from "@/lib/actions/content";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Website Content" };

export default async function AdminContent() {
  await requireRole("ADMIN");
  const [content, heroImage] = await Promise.all([getSiteContent(), getHeroImage()]);

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
        <h2 className="font-bold text-navy">Top-of-page photo</h2>
        <p className="mt-1 text-xs text-gray-500">
          Shown behind the headline at the top of the website (a team photo works
          great). It&apos;s automatically dimmed so the white text stays readable.
          Wide/landscape photos look best.
        </p>
        {heroImage && (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/site-images/hero"
              alt="Current top-of-page photo"
              className="h-40 w-full rounded-lg object-cover"
            />
          </div>
        )}
        <ActionForm
          action={updateHeroImage}
          submitLabel={heroImage ? "Replace photo" : "Upload photo"}
          pendingLabel="Uploading…"
          successMessage="Photo updated — it's live on the website."
          className="mt-3"
        >
          <input name="photo" type="file" required accept="image/*" className="input" aria-label="Top-of-page photo" />
        </ActionForm>
        {heroImage && (
          <ConfirmForm
            action={removeHeroImage}
            confirmText="Remove the top-of-page photo? The site goes back to the solid navy background."
            className="mt-2"
          >
            <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
              Remove photo (back to solid navy)
            </button>
          </ConfirmForm>
        )}
      </section>

      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">Website text</h2>
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
