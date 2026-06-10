import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";

export default async function PortalIndex() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/portal/admin");
  if (user.role === "EMPLOYEE") redirect("/portal/employee");
  redirect("/portal/client");
}
