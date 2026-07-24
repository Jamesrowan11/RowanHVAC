import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/guards";
import { COMPANY } from "@/lib/constants";
import LoginForm from "./LoginForm";

export const metadata = { title: "Portal Login" };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/portal");

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-navy-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-navy">
            Rowan <span className="text-accent">Heating &amp; Air Conditioning</span>
          </Link>
          <p className="mt-1 text-sm text-gray-500">Customer &amp; Employee Portal</p>
        </div>
        <div className="card mt-6">
          <h1 className="text-lg font-bold text-navy">Sign in</h1>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          Need help? Call us at{" "}
          <a href={COMPANY.phoneHref} className="font-medium text-navy hover:text-accent-600">
            {COMPANY.phone}
          </a>
        </p>
      </div>
    </main>
  );
}
