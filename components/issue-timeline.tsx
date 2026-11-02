import Link from "next/link";
import { LocalTime } from "@/components/local-time";

/**
 * The issue's history, newest step at the top (#issue-timeline): merge
 * reviews, judgements, delivery, award, bids, confirmations, idea. Each step
 * sits on one rail with the date it started; the latest state is highlighted
 * above it, not here.
 */
export function IssueTimeline({ children }: { children: React.ReactNode }) {
  return (
    <ol className="relative m-0 list-none p-0 before:absolute before:bottom-4 before:left-[6px] before:top-2 before:w-0.5 before:bg-zk-divider">
      {children}
    </ol>
  );
}

/** One step on the rail: its dot, level with the step's title (`StepTitle`), then its panel. The step sets the gap below it, whatever its panel's own margin. */
export function TimelineStep({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pb-6 pl-7 last:pb-0 [&>*]:!mb-0">
      <span
        aria-hidden="true"
        className="absolute left-0 top-px h-3.5 w-3.5 rounded-full border-2 border-electric-blue-strong bg-zk-surface"
      />
      {children}
    </li>
  );
}

/** When a timeline step started, pushed to the far right of its title row. */
export function StepDate({ at }: { at: Date | string | null | undefined }) {
  if (!at) return null;
  return (
    <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-xs font-normal normal-case tracking-normal text-zk-muted">
      <LocalTime date={at} absolute />
    </span>
  );
}

/**
 * A timeline step's title (#issue-timeline), outside its box: the step's name
 * and count (and any short note, as children), and when it started at the far
 * right. What the step holds goes in the box below it.
 */
export function StepTitle({
  id,
  title,
  count,
  at,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  at: Date | string | null | undefined;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h3 id={id} className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zk-muted">
        {title}
        {count === undefined ? null : <span className="font-mono font-normal normal-case tracking-normal">{count}</span>}
        {children}
      </h3>
      <StepDate at={at} />
    </div>
  );
}

/** The idea the issue was converted from, with when it came in and was converted. */
export function IdeaStep({
  number,
  href,
  verdicts,
  convertedAt,
}: {
  number: number;
  href: string;
  verdicts: number;
  convertedAt: Date | string | null;
}) {
  return (
    <section aria-labelledby="idea-step-heading">
      <StepTitle id="idea-step-heading" title="Idea" at={convertedAt} />
      <p className="m-0 rounded-xl border border-zk-divider px-3 py-2.5 text-[13px] text-zk-text2">
        <Link href={href} className="font-semibold text-zk-accent hover:underline">
          Idea #{number}
        </Link>
        {" "}· {verdicts} verdict{verdicts === 1 ? "" : "s"}
        {convertedAt ? " · converted to this issue" : ""}
      </p>
    </section>
  );
}

export type AwardStepView = {
  agentName: string;
  personName: string;
  offeredAt: Date | null;
  claimedAt: Date | null;
  releasedAt: Date | null;
};

/** The award: who was offered the issue, when, and when the agent accepted it. */
export function AwardStep({ award }: { award: AwardStepView }) {
  return (
    <section aria-labelledby="award-step-heading">
      <StepTitle id="award-step-heading" title="Award" at={award.offeredAt ?? award.claimedAt} />
      <div className="rounded-xl border border-zk-divider px-3 py-2.5 text-[13px] text-zk-text2">
      <p className="m-0">
        <b className="font-semibold text-zk-text">{award.agentName}</b> <span className="text-zk-muted">for {award.personName}</span>
      </p>
      <ul className="m-0 mt-0.5 list-none p-0 text-zk-muted">
        {award.offeredAt ? (
          <li>
            Offered <LocalTime date={award.offeredAt} absolute />
          </li>
        ) : null}
        {award.claimedAt ? (
          <li>
            Accepted <LocalTime date={award.claimedAt} absolute />
          </li>
        ) : (
          <li>Not accepted yet</li>
        )}
        {award.releasedAt ? (
          <li>
            Released <LocalTime date={award.releasedAt} absolute />
          </li>
        ) : null}
      </ul>
      </div>
    </section>
  );
}
