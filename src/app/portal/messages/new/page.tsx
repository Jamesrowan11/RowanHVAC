import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import NewThreadForm from "./NewThreadForm";

export const metadata = { title: "New Message" };

export default async function NewMessage() {
  const user = await requireUser();

  // Clients never see a staff directory — their messages go to the company.
  let groups: { label: string; users: { id: string; name: string }[] } [] | null = null;

  if (user.role !== "CLIENT") {
    const users = await db.user.findMany({
      where: { active: true, NOT: { id: user.id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    });
    groups = [
      { label: "Admins", users: users.filter((u) => u.role === "ADMIN") },
      { label: "Employees", users: users.filter((u) => u.role === "EMPLOYEE") },
      { label: "Clients", users: users.filter((u) => u.role === "CLIENT") },
    ].filter((g) => g.users.length > 0);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">New Message</h1>
      <div className="card max-w-xl">
        <NewThreadForm groups={groups} />
      </div>
    </div>
  );
}
