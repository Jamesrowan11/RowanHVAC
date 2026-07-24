import EmailsTabs from "@/components/portal/EmailsTabs";

export default function EmailsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <EmailsTabs />
      {children}
    </div>
  );
}
