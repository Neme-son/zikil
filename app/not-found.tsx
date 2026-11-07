import Link from "next/link";
import {
  StatusPage,
  primaryActionClass,
} from "@/components/status-page";
import { VersionFooter } from "@/components/version-footer";

export const metadata = { title: "Page not found" };

/** Any URL the app doesn't have a route for (#214). */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="flex flex-1 flex-col px-4">
        <StatusPage
          code="404"
          title="This page doesn't exist"
          actions={
            <Link href="/home" className={primaryActionClass}>
              Go to issues
            </Link>
          }
        >
          <p>Check the address, or head back to the issues list.</p>
        </StatusPage>
      </main>
      <VersionFooter className="border-t border-slate-200 px-4 py-3" />
    </div>
  );
}
