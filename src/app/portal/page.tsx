import { redirect } from "next/navigation";
import { requireUser, dashboardPath } from "@/lib/session";

export default async function PortalIndex() {
  const user = await requireUser();
  redirect(dashboardPath(user.role));
}
