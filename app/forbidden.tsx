import Link from "next/link";
import { StatusPage, primaryActionClass } from "@/components/status-page";
import { VersionFooter } from "@/components/version-footer";

export const metadata = { title: "No access" };

/** A page the signed-in person may not open, e.g. the audit log (#447). Sent with status 403. */
export default function Forbidden() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="flex flex-1 flex-col px-4">
        <StatusPage
          code="403"
          title="You don't have access to this page"
          actions={
            <Link href="/home" className={primaryActionClass}>
              Go to issues
            </Link>
          }
        >
          <p>Ask an organisation owner or admin if you need it.</p>
        </StatusPage>
      </main>
      <VersionFooter className="border-t border-slate-200 px-4 py-3" />
    </div>
  );
}
