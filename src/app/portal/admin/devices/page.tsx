import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { isTokenIdleExpired, VAN_TOKEN_IDLE_DAYS } from "@/lib/vanSync";
import { revokeVanDevice } from "../actions";

export default async function DevicesPage() {
  await requireRole("ADMIN");
  const devices = await prisma.vanDevice.findMany({
    orderBy: [{ revokedAt: "asc" }, { lastSeenAt: "desc" }],
    include: { user: { select: { name: true, email: true, active: true } } },
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Van Terminals"
        subtitle={`Toughbooks signed in to the van app. Revoke a device if a laptop is lost or replaced. Devices that haven't synced for ${VAN_TOKEN_IDLE_DAYS} days are signed out automatically.`}
      />

      {devices.length === 0 ? (
        <EmptyState>
          No van terminals yet. Install the van app (see van-app/README.md) and sign in
          with a technician account.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {devices.map((d) => {
            const signedOut =
              !!d.revokedAt || !d.user.active || isTokenIdleExpired(d.lastSeenAt);
            return (
              <div key={d.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-navy-900">{d.name}</h3>
                      {signedOut ? (
                        <span className="badge bg-navy-100 text-navy-500">
                          {d.revokedAt ? "Revoked" : "Signed out"}
                        </span>
                      ) : (
                        <span className="badge bg-green-100 text-green-800">Active</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-navy-500">
                      {d.user.name} · {d.user.email}
                    </p>
                    <p className="mt-1 text-xs text-navy-400">
                      Last sync {fmtDateTime(d.lastSeenAt)}
                      {d.lastIp ? ` from ${d.lastIp}` : ""}
                      {d.appVersion ? ` · app v${d.appVersion}` : ""} · signed in{" "}
                      {fmtDateTime(d.createdAt)}
                      {d.revokedAt ? ` · revoked ${fmtDateTime(d.revokedAt)}` : ""}
                    </p>
                  </div>
                  {!d.revokedAt && (
                    <form action={revokeVanDevice}>
                      <input type="hidden" name="id" value={d.id} />
                      <ConfirmButton message={`Sign out "${d.name}"? Unsynced changes on it will be lost.`}>
                        Revoke
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
