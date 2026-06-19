import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import {
  addServiceArea, updateServiceArea, deleteServiceArea, seedDefaultAreas,
} from "@/lib/actions/content";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Service Areas" };

export default async function AdminAreas() {
  await requireRole("ADMIN");

  const areas = await db.serviceArea.findMany({
    orderBy: [{ sortOrder: "asc" }, { region: "asc" }, { town: "asc" }],
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Service Areas</h1>
        <p className="mt-1 text-sm text-gray-500">
          These towns power the &ldquo;Are you in our service area?&rdquo; checker and the
          service-area list on your website. Add the ZIP codes for each town so
          the checker can recognize a customer&apos;s address.
        </p>
      </div>

      {areas.length === 0 && (
        <section className="card">
          <p className="text-sm text-gray-700">
            You haven&apos;t customized your service areas yet — the website is using
            the built-in default list. Click below to copy that list here so you
            can edit it.
          </p>
          <form action={seedDefaultAreas} className="mt-3">
            <button type="submit" className="btn-primary">Load the default service areas</button>
          </form>
        </section>
      )}

      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">Add a town</h2>
        <ActionForm
          action={addServiceArea}
          submitLabel="Add town"
          successMessage="Added."
          buttonClassName="btn-primary"
          className="mt-3 space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="region" className="label">Region / group heading</label>
              <input id="region" name="region" required placeholder="Howard County" className="input" />
            </div>
            <div>
              <label htmlFor="town" className="label">Town</label>
              <input id="town" name="town" required placeholder="Ellicott City" className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="zips" className="label">ZIP codes (space or comma separated)</label>
            <input id="zips" name="zips" placeholder="21042 21043" className="input" />
          </div>
        </ActionForm>
      </section>

      {areas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-navy">Current towns ({areas.length})</h2>
          {areas.map((a) => (
            <div key={a.id} className="card">
              <ActionForm
                action={updateServiceArea}
                submitLabel="Save"
                successMessage="Saved."
                resetOnSuccess={false}
                className="space-y-2"
              >
                <input type="hidden" name="id" value={a.id} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <input name="region" defaultValue={a.region} className="input" aria-label="Region" />
                  <input name="town" defaultValue={a.town} className="input" aria-label="Town" />
                  <input name="zips" defaultValue={a.zips} className="input" aria-label="ZIP codes" />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="active" defaultChecked={a.active} />
                  Show on website &amp; include in the address checker
                </label>
              </ActionForm>
              <ConfirmForm action={deleteServiceArea} confirmText={`Remove ${a.town}?`} className="mt-2">
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Remove</button>
              </ConfirmForm>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
