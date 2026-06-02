import { assertRole } from "@/lib/session";
import { PageHeader } from "@/components/portal/ui";
import { ClientRequestForm } from "./ClientRequestForm";

export default async function ClientRequestPage() {
  await assertRole("CLIENT");
  return (
    <>
      <PageHeader
        title="New Service / Quote Request"
        subtitle="Tell us what you need and we'll follow up."
      />
      <div className="card max-w-xl p-6">
        <ClientRequestForm />
      </div>
    </>
  );
}
