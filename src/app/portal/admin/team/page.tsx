import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { addTeamMember, updateTeamMember, deleteTeamMember } from "@/lib/actions/team";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Our Techs" };

export default async function AdminTeam() {
  await requireRole("ADMIN");

  const members = await db.teamMember.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Meet Our Techs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Add each technician&apos;s photo and name here — they appear in the
          &ldquo;Meet Our Techs&rdquo; section of the public website. The section stays
          hidden until you add someone.
        </p>
      </div>

      <section className="card max-w-xl">
        <h2 className="font-bold text-navy">Add a tech</h2>
        <ActionForm
          action={addTeamMember}
          submitLabel="Add to website"
          pendingLabel="Uploading…"
          successMessage="Added — they're live on the public site."
          buttonClassName="btn-primary"
          className="mt-4 space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="add-name" className="label">Name</label>
              <input id="add-name" name="name" required className="input" />
            </div>
            <div>
              <label htmlFor="add-title" className="label">Title (optional)</label>
              <input id="add-title" name="title" placeholder="Service Technician" className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="add-photo" className="label">Photo (JPG/PNG/WebP/HEIC, 8 MB max)</label>
            <input id="add-photo" name="photo" type="file" accept="image/*" className="input" />
          </div>
        </ActionForm>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {members.map((m) => (
          <div key={m.id} className="card">
            <div className="flex items-start gap-4">
              {m.photoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/team-photos/${m.id}`}
                  alt={`Photo of ${m.name}`}
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-full bg-navy-100 text-2xl font-bold text-navy-400">
                  {m.name.charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <ActionForm
                  action={updateTeamMember}
                  submitLabel="Save"
                  successMessage="Saved."
                  resetOnSuccess={false}
                  className="space-y-2"
                >
                  <input type="hidden" name="id" value={m.id} />
                  <input name="name" required defaultValue={m.name} className="input" aria-label="Name" />
                  <input name="title" defaultValue={m.title ?? ""} placeholder="Title" className="input" aria-label="Title" />
                  <input name="photo" type="file" accept="image/*" className="input" aria-label="Replace photo" />
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" name="active" defaultChecked={m.active} />
                    Show on website
                  </label>
                </ActionForm>
                <ConfirmForm action={deleteTeamMember} confirmText={`Remove ${m.name} from the website?`} className="mt-2">
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                </ConfirmForm>
              </div>
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="card text-sm text-gray-500 md:col-span-2">
            No techs added yet — the public section is hidden until you add the first one.
          </p>
        )}
      </section>
    </div>
  );
}
