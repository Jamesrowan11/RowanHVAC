import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/portal/ui";
import { ProfileForm, PasswordForm } from "./ProfileForms";

export default async function ProfilePage() {
  const user = await requireUser();
  const isStaff = user.role !== "CLIENT";

  // personalEmail isn't on the session object — fetch it for the form default.
  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: { personalEmail: true },
  });

  return (
    <>
      <PageHeader
        title="My Profile"
        subtitle="Update your own contact information and password."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-navy-900">Contact Information</h2>
          <ProfileForm
            showPersonalEmail={isStaff}
            defaults={{
              name: user.name,
              email: user.email,
              phone: user.phone ?? "",
              personalEmail: full?.personalEmail ?? "",
            }}
          />
        </div>
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-navy-900">Change Password</h2>
          <PasswordForm />
        </div>
      </div>
    </>
  );
}
