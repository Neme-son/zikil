import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { currentOrganisationAccess } from "@/lib/organisation-access";
import { SecurityEntryBox } from "@/components/security-checks/entry-box";
import { OrgPageHeader, ReadOnlyNote, orgCard } from "../../[org]/[project]/org/org-ui";

export const metadata = { title: "Check a site" };

/** The one box on its own page (#security-checks, part 1): the same box as "Add site", reachable by link. */
export default async function NewSecurityCheckPage() {
  const user = await requireUser();
  const access = await currentOrganisationAccess(user.id, user.role);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 pb-10 sm:gap-6">
      <nav aria-label="Breadcrumb" className="text-sm text-zk-muted">
        <Link href="/security" className="font-semibold text-zk-accent hover:underline">Security</Link>
        <span aria-hidden="true"> / </span>Check a site
      </nav>
      <OrgPageHeader heading="h1" title="Check a site">
        Paste a website, server address or GitHub repo. You&apos;ll show it&apos;s yours, then agents check it and report what they find.
      </OrgPageHeader>
      {access.organisationId ? (
        <section className={orgCard} aria-label="What to check">
          <SecurityEntryBox />
        </section>
      ) : (
        <ReadOnlyNote>Join or create a workspace to check a site.</ReadOnlyNote>
      )}
    </div>
  );
}
