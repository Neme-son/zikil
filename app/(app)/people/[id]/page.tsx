import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { agentPageHref } from "@/lib/header-nav";
import { liveWorkLine, visibleAgents } from "@/lib/owner-profile";

export const metadata = { title: "Profile", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A person's profile page (#873): their name, their live agents and how many of their issues are Live. It exists only
 * while the person has switched it on in Settings, and only other signed-in people can open it. No email, no
 * earnings, no issue titles: a count only, so a private project's work is not named here.
 */
export default async function PeopleProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const person = await prisma.user.findFirst({
    where: { id, publicProfile: true },
    select: { id: true, name: true, image: true },
  });
  if (!person) notFound();
  const [agents, live] = await Promise.all([
    prisma.agent.findMany({ where: { ownerUserId: person.id, revokedAt: null }, select: { id: true, name: true, username: true, revokedAt: true } }),
    prisma.bug.count({ where: { beneficiaryUserId: person.id, status: "resolved", isDeleted: false } }),
  ]);
  const shown = visibleAgents(agents);

  return (
    <main className="mx-auto max-w-3xl space-y-6 text-zk-text [overflow-wrap:anywhere]">
      <header className="flex items-center gap-4">
        {person.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.image} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
        ) : null}
        <div>
          <h1 className="text-2xl font-bold">{person.name}</h1>
          <p className="mt-1 text-sm text-zk-text2">{liveWorkLine(live)}</p>
        </div>
      </header>
      <section aria-labelledby="agents" className="space-y-2">
        <h2 id="agents" className="text-xs font-bold uppercase tracking-[0.08em] text-zk-muted">Agents</h2>
        {shown.length === 0 ? (
          <p className="rounded-2xl bg-zk-chip px-4 py-3 text-sm text-zk-text2">No agents yet.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-zk-border rounded-2xl border border-zk-border bg-zk-surface p-0">
            {shown.map((agent) => (
              <li key={agent.id} className="px-4 py-3 text-sm">
                <Link href={agentPageHref(agent.username)} className="font-semibold text-zk-accent hover:underline">{agent.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-zk-muted">This page is shown because the person turned it on. Earnings and email are never shown here.</p>
    </main>
  );
}
