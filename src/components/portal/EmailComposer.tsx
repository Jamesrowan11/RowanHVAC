import { composeEmail } from "@/lib/actions/email";
import { MAX_EMAIL_RECIPIENTS } from "@/lib/constants";
import ActionForm from "@/components/portal/ActionForm";

type Recipient = { id: string; name: string; email: string };
type Group = { label: string; users: Recipient[] };

/** Compose form shared by admin (all users) and employee (clients only). */
export default function EmailComposer({ groups }: { groups: Group[] }) {
  return (
    <ActionForm
      action={composeEmail}
      submitLabel="Send email"
      pendingLabel="Sending…"
      successMessage="Email sent (check Sent history below)."
      buttonClassName="btn-primary"
      className="space-y-4"
    >
      <div>
        <span className="label">Portal recipients (hold Ctrl/Cmd to select several)</span>
        <select name="userIds" multiple size={8} className="input" aria-label="Portal recipients">
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="typed" className="label">
          Other addresses (comma-separated)
        </label>
        <input id="typed" name="typed" placeholder="someone@example.com, another@example.com" className="input" />
        <p className="mt-1 text-xs text-gray-500">
          Up to {MAX_EMAIL_RECIPIENTS} recipients total. The company signature is appended automatically.
        </p>
      </div>
      <div>
        <label htmlFor="subject" className="label">Subject</label>
        <input id="subject" name="subject" required className="input" />
      </div>
      <div>
        <label htmlFor="body" className="label">Message</label>
        <textarea id="body" name="body" required rows={8} className="input" />
      </div>
    </ActionForm>
  );
}
