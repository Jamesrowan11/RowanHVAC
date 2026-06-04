import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader, fmtDate } from "@/components/portal/ui";
import { COMPANY } from "@/lib/company";
import { scheduleMaintenance } from "../actions";

export default async function ClientMaintenance() {
  const user = await requireRole("CLIENT");
  const policy = await prisma.maintenancePolicy.findUnique({
    where: { clientId: user.id },
  });
  const hasActive = !!policy?.active;

  return (
    <>
      <PageHeader title="Maintenance" subtitle="Your service agreement and maintenance scheduling." />

      <div className="card p-6">
        {hasActive ? (
          <>
            <div className="mb-4">
              <span className="badge bg-green-100 text-green-800">Active policy</span>
              {policy?.renewalDate && (
                <span className="ml-2 text-sm text-navy-500">
                  Renews {fmtDate(policy.renewalDate)}
                </span>
              )}
            </div>
            <p className="text-sm text-navy-600">
              As a service-agreement customer, you can request a maintenance visit
              and our team will schedule it for you.
            </p>
            <form action={scheduleMaintenance} className="mt-4">
              <button type="submit" className="btn-primary">
                Schedule Maintenance
              </button>
            </form>
          </>
        ) : (
          <>
            <span className="badge bg-navy-100 text-navy-500">No active policy</span>
            <p className="mt-4 text-sm text-navy-600">
              You don&apos;t currently have an active maintenance agreement. To set
              one up or ask about our service agreements, please contact us at{" "}
              <a className="text-accent hover:underline" href={COMPANY.phoneHref}>
                {COMPANY.phone}
              </a>{" "}
              or{" "}
              <a className="text-accent hover:underline" href={`mailto:${COMPANY.email}`}>
                {COMPANY.email}
              </a>
              .
            </p>
          </>
        )}
      </div>
    </>
  );
}
