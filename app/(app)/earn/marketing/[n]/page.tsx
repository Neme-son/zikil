import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatZ } from "@/lib/points/rules";
import { EARN_TASKS, WITHDRAW_THRESHOLD, earnBalance, stageAfterPaying, tasksPaid, zikiTaskPath } from "@/lib/earn/draft";
import { sampleStage, startedTask } from "@/lib/earn/state";
import { EarnTaskWork } from "@/components/earn-task-work";
import { EarnTopStrip } from "@/components/earn-top-strip";
import { EarnCelebrate } from "@/components/earn-celebrate";
import { agentsLink, agentsPrimaryBtn, agentsSurface } from "@/app/(app)/settings/agents/agents-ui";

export const metadata = { title: "Marketing task" };

type State = "locked" | "open" | "in-progress" | "in-review" | "paid";

/** The three beats of a task, in plain words (not the builders' Open, In progress, In review, Paid). */
const BEATS = [
  { key: "in-progress", label: "You and your agent do it" },
  { key: "in-review", label: "Ziki checks it" },
  { key: "paid", label: "You get paid" },
] as const;

/**
 * One marketing task (#earn-drafts, Mark's call of 5 Nov): the earner's own
 * page for doing it, at /earn/marketing/<n>. Not an issue page: no number,
 * summary, stage tracker, reporter or assignee. It says what you do, what your
 * agent does, and what happens next; when it's paid, it celebrates.
 */
export default async function EarnTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<{ step?: string; p?: string; celebrate?: string }>;
}) {
  const { n: raw } = await params;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > EARN_TASKS.length) notFound();
  const user = await requireUser();
  const query = await searchParams;
  const stage = await sampleStage();
  const started = await startedTask();
  const paid = tasksPaid(stage);
  const index = n - 1;
  const task = EARN_TASKS[index];
  const here = zikiTaskPath(n);

  // Draft: the step of the task comes from the address (?step=), since nothing is saved yet.
  if (index === paid && (query.step === "in-progress" || query.step === "in-review") && started !== n) redirect(`/earn/start-task?n=${n}${query.step === "in-review" ? "&to=in-review" : ""}`);
  const state: State =
    index < paid ? "paid" : index > paid ? "locked" : query.step === "in-progress" || query.step === "in-review" ? query.step : started === n ? "in-progress" : "open";
  const person = Number(query.p ?? 0) || 0;
  const agent = await prisma.agent.findFirst({ where: { ownerUserId: user.id, revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, avatar: true } }).catch(() => null);
  const agentName = agent?.name ?? "Your agent";
  const balance = earnBalance(stage);
  const next = EARN_TASKS[index + 1];
  const beat = state === "in-progress" ? 0 : state === "in-review" ? 1 : state === "paid" ? 2 : -1;
  const celebrate = state === "paid" && query.celebrate === "1" && index === paid - 1;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <EarnTopStrip balance={balance} />
      <Link href="/earn/marketing" className={`text-sm ${agentsLink}`}>← Marketing</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <span className="inline-flex rounded-full bg-zk-info-bg px-2.5 py-1 text-xs font-bold text-zk-info-fg">Task {n} of {EARN_TASKS.length}</span>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-zk-text">{task.title}</h1>
          <p className="max-w-2xl text-sm text-zk-text2">{task.detail}</p>
        </div>
        <span className="rounded-[10px] bg-zk-ok-bg px-3.5 py-1.5 text-lg font-extrabold tabular-nums text-zk-ok-fg">+{formatZ(task.pay)}</span>
      </div>

      {celebrate ? <EarnCelebrate agent={agent} taskNumber={n} pay={task.pay} from={balance.earned - task.pay} to={balance.earned} total={WITHDRAW_THRESHOLD} /> : null}

      <div>
        <div className="min-w-0 space-y-5">
          {/* Three plain beats, only once the task is under way. */}
          {beat >= 0 ? (
            <ol aria-label="Where this task is" className="m-0 grid list-none grid-cols-3 gap-2 p-0">
              {BEATS.map((b, i) => (
                <li key={b.key} className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-bold ${i < beat || (i === beat && state === "paid") ? "bg-zk-ok-bg text-zk-ok-fg" : i === beat ? "bg-zk-info-bg text-zk-info-fg" : "bg-zk-chip text-zk-muted"}`}>
                  <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${i < beat || (i === beat && state === "paid") ? "bg-zk-ok-fg text-white" : i === beat ? "bg-electric-blue-strong text-white" : "bg-zk-surface text-zk-muted"}`}>
                    {i < beat || (i === beat && state === "paid") ? "✓" : i + 1}
                  </span>
                  {b.label}
                </li>
              ))}
            </ol>
          ) : null}

          {state === "locked" ? (
            <section className={`${agentsSurface} space-y-2 p-5 sm:p-6`}>
              <h2 className="text-lg font-extrabold text-zk-text">Opens after task {n - 1}</h2>
              <p className="text-sm text-zk-text2">Tasks go one at a time, and each builds on the one before.</p>
              <Link href={zikiTaskPath(n - 1)} className={`text-sm ${agentsLink}`}>Go to task {n - 1}: {EARN_TASKS[n - 2].title} →</Link>
            </section>
          ) : state === "open" ? (
            <section className={`${agentsSurface} space-y-3 p-5 sm:p-6`}>
              <h2 className="text-lg font-extrabold text-zk-text">Ready when you are</h2>
              <p className="text-sm text-zk-text2">Hand it to {agentName} and it gets going. You’ll do your part below once it’s started.</p>
              <Link href={`/earn/start-task?n=${n}`} prefetch={false} className={agentsPrimaryBtn}>Give it to my agent</Link>
            </section>
          ) : state === "in-review" ? (
            <section className={`${agentsSurface} space-y-2 p-5 sm:p-6`}>
              <h2 className="text-lg font-extrabold text-zk-text">Ziki is checking it</h2>
              <p className="text-sm text-zk-text2">Every task is checked before it pays. You’ll see it here the moment it’s paid.</p>
              {/* Draft only: stands in for Ziki checking it. */}
              {/* A plain link: a full page load, so the header's balance updates too. */}
              <a href={`/earn/preview?state=${stageAfterPaying(stage)}&next=${encodeURIComponent(here)}&celebrate=1`} className={`text-xs ${agentsLink}`}>Draft: mark it checked and paid</a>
            </section>
          ) : state === "paid" ? (
            <section className={`${agentsSurface} space-y-3 p-5 sm:p-6`}>
              <h2 className="text-lg font-extrabold text-zk-text">Paid</h2>
              <p className="text-sm text-zk-text2">+{formatZ(task.pay)} is in your balance.</p>
              {next ? (
                <Link href={zikiTaskPath(n + 1)} className={agentsPrimaryBtn}>Next: {next.title}</Link>
              ) : (
                <Link href="/earn/people" className={agentsPrimaryBtn}>All four done. See who you reached</Link>
              )}
            </section>
          ) : null}

          {state === "in-progress" || state === "in-review" || state === "paid" ? (
            <section aria-labelledby="task-work" className={`${agentsSurface} space-y-4 p-5 sm:p-6`}>
              <h2 id="task-work" className="text-xs font-bold uppercase tracking-[0.06em] text-zk-muted">Your work</h2>
              <EarnTaskWork
                id={task.id}
                agent={agent}
                person={person}
                done={state !== "in-progress"}
                tabHref={(i) => `${here}?step=${state === "paid" ? "" : state}&p=${i}`}
              />
              {state === "in-progress" ? (
                <div className="flex justify-end border-t border-zk-divider pt-4">
                  <Link href={`${here}?step=in-review`} className={agentsPrimaryBtn}>Send for checking</Link>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

      </div>
    </div>
  );
}
