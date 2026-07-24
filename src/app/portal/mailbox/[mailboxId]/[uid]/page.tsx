import Link from "next/link";
import { notFound } from "next/navigation";
import { getMailboxMessageBody } from "@/lib/mailboxRead";

export const metadata = { title: "Message" };
export const dynamic = "force-dynamic";

export default async function MailboxMessagePage({
  params,
}: {
  params: Promise<{ mailboxId: string; uid: string }>;
}) {
  const { mailboxId, uid } = await params;
  const uidNum = Number(uid);
  if (!Number.isInteger(uidNum)) notFound();

  // getMailboxMessageBody checks the current session user actually has
  // MailboxAccess to this mailboxId — there's no way to read a mailbox
  // that wasn't explicitly granted to them.
  const message = await getMailboxMessageBody(mailboxId, uidNum);
  if (!message) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/portal/profile?mailbox=${mailboxId}`} className="text-sm font-medium text-accent-600 hover:underline">
        ← Back to My Mailbox
      </Link>
      <div className="card">
        <h1 className="text-xl font-bold text-navy">{message.subject}</h1>
        <p className="mt-1 text-sm text-gray-500">
          From {message.from} · {new Date(message.date).toLocaleString("en-US", {
            month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
          })}
        </p>
        <hr className="my-4 border-gray-100" />
        {message.html ? (
          // Email HTML is untrusted content — sandboxed with no script/same-origin
          // access so a malicious sender can never run code in the portal's origin.
          <iframe
            title="Message content"
            srcDoc={message.html}
            sandbox=""
            className="h-[500px] w-full rounded border border-gray-100"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-gray-800">{message.text}</p>
        )}
      </div>
    </div>
  );
}
