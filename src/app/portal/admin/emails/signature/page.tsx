import { requireRole } from "@/lib/guards";
import { getSignature } from "@/lib/email";
import { updateSignature } from "@/lib/actions/signature";
import ActionForm from "@/components/portal/ActionForm";

export const metadata = { title: "Email Signature" };

export default async function AdminSignature() {
  await requireRole("ADMIN");
  const signature = await getSignature();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Email Signature</h1>
        <p className="mt-1 text-sm text-gray-500">
          Appended automatically to every email the portal sends — composed
          emails, replies, and automated notifications alike.
        </p>
      </div>

      <section className="card max-w-2xl">
        <ActionForm
          action={updateSignature}
          submitLabel="Save signature"
          successMessage="Signature updated."
          resetOnSuccess={false}
          buttonClassName="btn-primary"
        >
          <label htmlFor="signature" className="label">Signature (plain text)</label>
          <textarea id="signature" name="signature" rows={7} defaultValue={signature} className="input font-mono" />
        </ActionForm>
      </section>
    </div>
  );
}
