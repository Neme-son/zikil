import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { currentOrganisationAccess } from "@/lib/organisation-access";
import type { SecurityTargetKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TARGET_KIND_LABEL } from "@/lib/security-checks";
import { canPayForCheck } from "@/lib/security-checks/payment";
import { PayCheckForm } from "@/components/security-checks/entry-pay-form";
import { KindIcon } from "@/components/security-checks/entry-box";

export const metadata = { title: "Pay for a check" };

/**
 * Step 3, pay or skip (#security-checks, part 1). Paying is simulated for now:
 * it only marks the check paid. Skipping keeps it unpaid; the client sees a
 * teaser of the report and can pay from there later.
 */
export default async function PaySecurityCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const access = await currentOrganisationAccess(user.id, user.role);
  if (!access.organisationId) notFound();

  const check = await prisma.securityCheck.findFirst({
    // Only the person who asked for the check can see or pay for it.
    where: { id, organisationId: access.organisationId, requestedById: user.id },
    select: {
      id: true,
      status: true,
      paidAt: true,
      priceCoins: true,
      target: { select: { kind: true, value: true, verifiedAt: true } },
    },
  });
  if (!check) notFound();

  const payable = canPayForCheck(check);
  const verified = check.target.verifiedAt !== null;
  const back = `/security?check=${encodeURIComponent(check.id)}`;
  const site = check.target.value;
  const kind = check.target.kind;

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col pb-12 pt-2">
      <Link href={back} className="inline-flex w-fit items-center gap-1.5 text-sm text-zk-text2 hover:text-zk-text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        Your checks
      </Link>

      <p className="mb-0 mt-8 text-sm text-zk-muted">Step 2 of 3 · Pay</p>
      <h1 className="mb-0 mt-1 text-[28px] font-bold leading-tight tracking-tight text-zk-text">
        Pay for the <span className="break-all">{site}</span> check
      </h1>
      <p className="mb-0 mt-2 text-[15px] leading-relaxed text-zk-text2">{WHAT_AGENTS_DO[kind](site)}</p>

      <section aria-label="Receipt" className="mt-8 rounded-2xl border border-zk-border bg-zk-surface">
        <div className="flex items-center gap-3 border-b border-zk-border px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-zk-bg">
            <KindIcon kind={kind} className="h-[18px] w-[18px] text-zk-text2" />
          </span>
          <div className="min-w-0">
            <p className="m-0 truncate text-[15px] font-semibold text-zk-text">{site}</p>
            <p className="m-0 text-[13px] text-zk-muted">{TARGET_KIND_LABEL[kind]}</p>
          </div>
        </div>

        <dl className="m-0 px-5 py-4 text-[15px]">
          <Line label="Security check" detail={`Agents go through ${site} part by part`} value={`${check.priceCoins} coins`} />
          <Line label="Report, worst first" detail="With how to fix each problem" value="Included" muted />
          <Line label="PDF or Fix on Ziki" detail="Download it, or send problems to your team" value="Included" muted />
          <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-zk-border pt-4">
            <dt className="font-semibold text-zk-text">Total</dt>
            <dd className="m-0 text-xl font-bold tabular-nums text-zk-text">{check.priceCoins} coins</dd>
          </div>
        </dl>
      </section>

      {!verified && !check.paidAt && payable ? (
        <p className="mb-0 mt-4 text-[13px] leading-relaxed text-zk-text2">
          Nothing runs until you&apos;ve shown {site} is yours. Paying now just means you won&apos;t have to come back.
        </p>
      ) : null}

      <div className="mt-6">
        {check.paidAt ? (
          <div role="status" className="rounded-2xl border border-zk-border bg-zk-surface px-5 py-4">
            <p className="m-0 font-semibold text-zk-ok-fg">Paid</p>
            <p className="m-0 mt-1 text-sm text-zk-text2">You&apos;ll get the full report on {site} once agents finish.</p>
            <Link href={back} className="mt-3 inline-flex text-sm font-semibold text-zk-accent hover:underline">Back to your checks</Link>
          </div>
        ) : payable ? (
          <PayCheckForm checkId={check.id} priceCoins={check.priceCoins} skipHref={back} />
        ) : (
          <p className="m-0 text-sm text-zk-text2">This check was cancelled, so there&apos;s nothing to pay.</p>
        )}
      </div>

      <p className="mb-0 mt-6 text-center text-xs text-zk-muted">Test payment. No coins move yet.</p>
    </div>
  );
}

/** What agents will do, in the words that fit what was pasted. */
const WHAT_AGENTS_DO: Record<SecurityTargetKind, (site: string) => string> = {
  website: (site) => `Agents go through ${site} page by page, look for weaknesses, and write up each one with how to fix it. They never break in.`,
  server: (site) => `Agents look at what ${site} has open to the internet, and write up each weakness with how to fix it. They never break in.`,
  repo: (site) => `Agents read the code in ${site}, and write up each weakness they find with how to fix it. They never change your code.`,
};

function Line({ label, detail, value, muted = false }: { label: string; detail: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="min-w-0">
        <span className="block text-zk-text">{label}</span>
        <span className="block truncate text-[13px] text-zk-muted">{detail}</span>
      </dt>
      <dd className={`m-0 shrink-0 tabular-nums ${muted ? "text-zk-muted" : "font-medium text-zk-text"}`}>{value}</dd>
    </div>
  );
}
