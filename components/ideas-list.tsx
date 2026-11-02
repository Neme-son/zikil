import Link from "next/link";
import { IdeaVoteBadge } from "@/components/vote-badge";
import { IdeaRowStatus } from "@/components/issue-row-status";
import { IdeaPathChips } from "@/components/idea-path";
import { LocalTime } from "@/components/local-time";
import { ideaPath } from "@/lib/project-paths";

export type IdeaListRow = {
  id: string;
  number: number;
  title: string;
  score: number;
  /** The project's `ideaThreshold`; null when it could not be read. */
  threshold: number | null;
  createdAt: Date;
  reporterName: string | null;
  platform: string | null;
  verdicts: number;
  /** A manager agent rejected it (#idea-rejected). */
  rejected?: boolean;
  /** A manager agent archived it (#idea-archive): the reason in words, e.g. "Already implemented". */
  archived?: string | null;
  /** Bad: manager agents are advised to reject it (lib/idea-rejection.ts). */
  bad?: boolean;
  /** Weighted good and bad votes (#724), shown as columns; 0 when nobody voted. */
  good: number;
  badVotes: number;
  /** The viewer already gave it a verdict (good, bad or neutral): its path shows In progress → Done, not Approve. */
  approvedByMe?: boolean;
  /** The latest thing that happened to it: an edit, a verdict, a rejection or archiving. */
  lastUpdateAt?: Date;
};

/**
 * The Ideas tab's New ideas, Drafted and Rejected ideas lists (#idea-table, #idea-rejected). Ideas are not issues: they
 * have their own numbers and pages, take verdicts instead of votes, and
 * leave this list once an agent converts them.
 */
export function IdeasList({ slug, ideas, empty, welcome }: {
  slug: string;
  ideas: IdeaListRow[];
  empty?: string;
  /** No open ideas yet: what Ziki is for, and a box to type the first one in. */
  welcome?: React.ReactNode;
}) {
  if (ideas.length === 0 && welcome) return <>{welcome}</>;
  if (ideas.length === 0) {
    return (
      <div className="rounded-[20px] border border-zk-border bg-zk-surface px-4 py-12 text-center">
        <p className="font-bold text-zk-text">Nothing here right now.</p>
        <p className="mt-1.5 text-sm text-zk-muted">
          {empty ?? "New ideas show up here until an agent converts them to issues."}
        </p>
      </div>
    );
  }
  return (
    <section className="issues-results flex flex-col gap-3.5" aria-label="Ideas">
      <div className="issues-table relative">
        <div>
          <div className="issues-table-heading">
            <span className="w-[52px]">Score</span>
            <span className="min-w-0 flex-1">Idea</span>
            <span className="hidden w-24 shrink-0 md:block">Last update</span>
            <span className="issues-status-cell" style={{ width: 264, flexBasis: 264 }}>Status</span>
          </div>
          <ul>
            {ideas.map((idea, index) => (
              <li
                key={idea.id}
                data-testid="idea-row"
                className={`issues-row flex items-center gap-2 px-2 py-3.5 lg:gap-4 lg:px-4 ${
                  index < ideas.length - 1 ? "border-b border-zk-divider" : ""
                }`}
              >
                <div className="issues-vote w-[52px] shrink-0">
                  <IdeaVoteBadge
                    ideaId={idea.id}
                    good={idea.good}
                    bad={idea.badVotes}
                    score={idea.score}
                    threshold={idea.threshold}
                    votable={!idea.rejected && !idea.archived}
                  />
                </div>
                <Link
                  href={ideaPath(slug, idea.number)}
                  className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-electric-blue"
                >
                  <span className="issues-row-title text-sm font-semibold leading-snug text-zk-text">{idea.title}</span>
                  <span className="issues-row-meta flex flex-wrap items-center gap-2 text-xs text-zk-muted">
                    <span className="font-mono tabular-nums">Idea #{idea.number}</span>
                    {idea.reporterName ? <span>{idea.reporterName}</span> : null}
                    <span>
                      {idea.verdicts} verdict{idea.verdicts === 1 ? "" : "s"}
                    </span>
                    {idea.platform ? <span>{idea.platform}</span> : null}
                    <LocalTime date={idea.createdAt} />
                    <span className="inline-flex min-w-0 md:sr-only">
                      <IdeaRowStatus score={idea.score} threshold={idea.threshold} rejected={idea.rejected} archived={idea.archived} bad={idea.bad} />
                    </span>
                  </span>
                </Link>
                <span className="hidden w-24 shrink-0 text-xs text-zk-muted md:block" data-testid="idea-last-update">
                  {idea.lastUpdateAt ? <LocalTime date={idea.lastUpdateAt} /> : null}
                </span>
                {/* Idea → In progress → Done (or → Rejected), like the Live tab's deploy steps. Wider than the issues' status cell. */}
                <span className="issues-status-cell" style={{ width: 264, flexBasis: 264 }}>
                  <IdeaPathChips ideaId={idea.id} approvedByMe={Boolean(idea.approvedByMe)} score={idea.score} threshold={idea.threshold} rejected={idea.rejected} archived={idea.archived} bad={idea.bad} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
