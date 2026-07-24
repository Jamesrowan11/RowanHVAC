import { requireRole } from "@/lib/guards";
import { COMPANY } from "@/lib/constants";
import { ServiceRequestForm, MaintenanceForm } from "./RequestForms";

export const metadata = { title: "New Request" };

export default async function ClientRequest({
  searchParams,
}: {
  searchParams: Promise<{ maintenance?: string }>;
}) {
  const user = await requireRole("CLIENT");
  const { maintenance } = await searchParams;
  const showMaintenanceFirst = maintenance === "1" && user.policyActive;

  const maintenanceCard = (
    <section className="card">
      <h2 className="font-bold text-navy">Schedule Maintenance</h2>
      {user.policyActive ? (
        <>
          <p className="mt-1 text-sm text-gray-600">
            Your service agreement is active — request your maintenance visit and
            the office will confirm a time.
          </p>
          <div className="mt-4"><MaintenanceForm /></div>
        </>
      ) : (
        <p className="mt-2 text-sm text-gray-700">
          Maintenance self-scheduling is available with an active service
          agreement. Please contact us at{" "}
          <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a>{" "}
          or <a href={`mailto:${COMPANY.email}`} className="font-medium text-accent-600">{COMPANY.email}</a>{" "}
          to enroll.
        </p>
      )}
    </section>
  );

  const requestCard = (
    <section className="card">
      <h2 className="font-bold text-navy">Service / Quote Request</h2>
      <p className="mt-1 text-sm text-gray-600">
        Tell us what you need — repairs, replacements, estimates, anything.
      </p>
      <div className="mt-4"><ServiceRequestForm /></div>
    </section>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">New Request</h1>
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        {showMaintenanceFirst ? (
          <>{maintenanceCard}{requestCard}</>
        ) : (
          <>{requestCard}{maintenanceCard}</>
        )}
      </div>
    </div>
  );
}
