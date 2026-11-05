import Link from "next/link";
import { formatZ } from "@/lib/points/rules";
import { EARN_CC_ADDRESS, EARN_LINK, EARN_PEOPLE, EARN_POST_OPENS, type EarnTaskId } from "@/lib/earn/draft";
import { AgentAvatar } from "@/components/agent-avatar";
import {
  agentsChipClass,
  agentsInputClass,
  agentsLink,
  agentsMutedClass,
  agentsPrimaryBtn,
  agentsSecondaryBtn,
  agentsSurface,
} from "@/app/(app)/settings/agents/agents-ui";

const pill = (tone: "ok" | "warn" | "bad") =>
  `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
    tone === "ok" ? "bg-zk-ok-bg text-zk-ok-fg" : tone === "warn" ? "bg-zk-warn-bg text-zk-warn-fg" : "bg-zk-bad-bg text-zk-bad-fg"
  }`;

/**
 * The work for each Ziki task (#earn-drafts): what the earner and their agent do.
 * Shown as "Your work" on the task's own page.
 */
export function EarnTaskWork({ id, agent, person, done, tabHref = (i) => `?p=${i}` }: { id: EarnTaskId; agent: { id: string; name: string; avatar: string | null } | null; person: number; done: boolean; tabHref?: (i: number) => string }) {
  const agentName = agent?.name ?? "Your agent";
  if (id === "who") {
    return (
      <>
        <p className="max-w-2xl text-sm text-zk-text2">
          Describe one kind of person or business that would pay to get an app or website built or fixed. Your agent looks for people like this in the next task.
        </p>
        {/* The same box as Add Idea. */}
        <form className="rounded-[22px] border border-zk-border bg-zk-surface px-4 pb-2.5 pt-3 shadow-[0_2px_10px_rgba(0,0,0,0.06)] focus-within:border-electric-blue-strong/50">
          <label htmlFor="earn-who" className="sr-only">Who needs Ziki</label>
          <textarea
            id="earn-who"
            rows={3}
            defaultValue="Bakeries in Lagos that take orders on Instagram but have no website"
            className="block w-full resize-none border-0 bg-transparent p-1 text-[15px] leading-6 text-zk-text focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="px-1 text-xs text-zk-muted">A place, a kind of business, a problem they have.</span>
            <button type="button" aria-label="Save" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zk-text text-zk-surface">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
        </form>
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-zk-muted">Need an idea?</p>
          <div className="flex flex-wrap gap-2">
            {["Salons that book by WhatsApp", "Churches with no online giving", "Schools sending results on paper", "Shops with a broken checkout"].map((idea) => (
              <button key={idea} type="button" className="inline-flex min-h-9 items-center rounded-full border border-zk-border bg-zk-surface px-3.5 text-sm text-zk-text hover:bg-zk-chip">{idea}</button>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (id === "research") {
    const rows = [
      { name: "Mama Ade's Bakery", where: "Surulere, Lagos", reach: "hello@mamaade.ng", why: "Takes orders by Instagram DM, 2,100 followers, no website", status: <span className={pill("ok")}>Accepted · +$1</span> },
      { name: "Crust & Co", where: "Lekki, Lagos", reach: "crustandco@gmail.com", why: "Menu is a photo on WhatsApp status, no way to pay online", status: <span className={pill("warn")}>Being checked</span> },
      { name: "Sweet Tooth NG", where: "Yaba, Lagos", reach: "sweettooth.ng", why: "Already has a working website", status: <span className={pill("bad")} title="It already has a working website">Not accepted</span> },
    ];
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-zk-text2">
            Your agent finds businesses that match <span className="font-semibold text-zk-text">&ldquo;Bakeries in Lagos with no website&rdquo;</span>. Each one is checked before it pays.
          </p>
          {agent ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-zk-border bg-zk-surface py-1 pl-1 pr-3 text-sm font-semibold text-zk-text">
              <AgentAvatar agentId={agent.id} avatar={agent.avatar} size={28} />
              {agent.name} is researching
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-zk-ok-fg" />
            </span>
          ) : (
            <Link href="/earn" className={agentsSecondaryBtn}>Connect your agent</Link>
          )}
        </div>
        <section aria-labelledby="found" className="overflow-hidden rounded-[20px] border border-zk-border bg-zk-surface">
          <h2 id="found" className="border-b border-zk-border bg-zk-tint px-4 py-3 text-base font-semibold text-zk-text sm:px-6">Found so far</h2>
          <ul className="m-0 list-none divide-y divide-zk-border p-0">
            {rows.map((row) => (
              <li key={row.name} className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-center sm:gap-4 sm:px-6">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-zk-text">{row.name}</p><p className="text-xs text-zk-muted">{row.where}</p></div>
                <p className="truncate text-sm text-zk-text2">{row.reach}</p>
                <p className="text-sm text-zk-text2">{row.why}</p>
                <span className="justify-self-start sm:justify-self-end">{row.status}</span>
              </li>
            ))}
            <li className="flex flex-wrap items-center gap-3 px-4 py-4 text-sm text-zk-muted sm:px-6">
              <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-zk-border border-t-electric-blue-strong motion-safe:animate-spin" />
              {agent ? `${agent.name} is looking for one more…` : "Waiting for your agent…"}
              <span className="flex-1" />
              <button type="button" className={agentsSecondaryBtn}>Add a person yourself</button>
            </li>
          </ul>
        </section>
        <p className={agentsMutedClass}>The same business twice only counts once. Not accepted means it didn&apos;t fit, and your agent tries another.</p>
      </>
    );
  }

  if (id === "emails") {
    // Uche's email view (per-person tabs, From / To / Cc / Subject) inside Tolu's frame (progress and "Why 10 emails").
    const people = EARN_PEOPLE.slice(0, 4);
    const current = people[Math.min(Math.max(person, 0), people.length - 1)];
    const greet: Record<string, string> = { "Mama Ade's Bakery": "Ade", "Crust & Co": "Crust & Co team", "Bread Basket Ikeja": "Bread Basket team", "Funmi's Cakes": "Funmi" };
    const sent = done ? 10 : 0;
    return (
      <>
        <p className="max-w-2xl text-sm text-zk-text2">{agentName} wrote one email for each person from your research. You send each one from your own inbox, so it comes from a real person.</p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
          <div className="space-y-4">
            <section aria-labelledby="email-progress" className={`${agentsSurface} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="email-progress" className="text-sm text-zk-muted"><span className="text-2xl font-extrabold tabular-nums text-zk-text">{sent}</span> of 10 sent</h2>
                {sent ? <span className="text-xs font-semibold text-zk-ok-fg">All counted · +{formatZ(5)} earned</span> : <span className="text-xs font-semibold text-zk-muted">Send all 10 to earn +{formatZ(5)}</span>}
              </div>
              <div aria-hidden="true" className="mt-3 grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, i) => <span key={i} className={`h-1.5 rounded-full ${i < sent ? "bg-zk-ok-fg" : "bg-zk-seg"}`} />)}
              </div>
            </section>

            <nav aria-label="Emails" className="flex flex-wrap gap-2">
              {people.map((p, i) => (
                <Link
                  key={p.name}
                  href={tabHref(i)}
                  aria-current={p === current ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${p === current ? "border-electric-blue/40 bg-zk-tint text-zk-accent" : "border-zk-border bg-zk-surface text-zk-text2 hover:bg-zk-chip"}`}
                >
                  {sent ? <span aria-hidden="true" className="text-zk-ok-fg">✓</span> : null} {i + 1} · {p.name}
                </Link>
              ))}
              <span className="inline-flex min-h-9 items-center rounded-full border border-zk-border bg-zk-surface px-3 text-xs font-semibold text-zk-muted">+{EARN_PEOPLE.length - people.length}</span>
            </nav>

            <section aria-label={`Email to ${current.name}`} className="overflow-hidden rounded-[20px] border border-zk-border bg-zk-surface">
              <dl className="m-0 divide-y divide-zk-border text-sm">
                {[
                  ["From", <span key="from">Chloe Trinity <span className="text-zk-muted">· your own email</span></span>],
                  ["To", <span key="to">{current.name} <span className="text-zk-muted">· {current.contact}</span></span>],
                  ["Cc", <span key="cc" className="inline-flex flex-wrap items-center gap-2"><span className="font-mono text-zk-text">{EARN_CC_ADDRESS}</span><span className="rounded-full bg-zk-info-bg px-2 py-0.5 text-[11px] font-bold text-zk-info-fg">Required</span></span>],
                  ["Subject", <span key="subject" className="font-semibold">A website for {current.name}, built by AI agents</span>],
                ].map(([label, value]) => (
                  <div key={label as string} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5 sm:px-5">
                    <dt className="text-zk-muted">{label}</dt>
                    <dd className="m-0 min-w-0 truncate text-zk-text">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="whitespace-pre-line border-t border-zk-border px-4 py-4 text-sm leading-6 text-zk-text2 sm:px-5">{`Hi ${greet[current.name] ?? "there"},

I saw ${current.name} online. Customers have to send a message to order, and there's no website to order from.

Ziki can get you a simple ordering website built by AI agents, and you approve everything before it goes live. Have a look: ${EARN_LINK}

Chloe`}</p>
            </section>
            <p className={agentsMutedClass}>Ziki is copied so each send counts. 10 emails per account, never more.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={agentsPrimaryBtn}>Open in my email app</button>
              <button type="button" className={agentsSecondaryBtn}>Copy email</button>
              <button type="button" className={agentsSecondaryBtn}>Edit this email</button>
            </div>
          </div>

          <aside className={`${agentsSurface} space-y-3 p-4 text-sm text-zk-text2 sm:p-5`}>
            <h2 className="text-sm font-bold text-zk-text">Why 10 emails</h2>
            <p>Each email goes from you to one business, written for them. Ten is the limit per person, so every one stays personal and worth reading.</p>
            <p>If one of the people you emailed starts using Ziki, your locked money opens and you can withdraw.</p>
            <Link href="/earn/withdraw" className={agentsLink}>See your progress to {formatZ(30)}</Link>
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="max-w-2xl text-sm text-zk-text2">Share your link where people you know will see it. Anyone who starts through it counts as someone you reached.</p>
      <section aria-labelledby="post-text" className={`${agentsSurface} space-y-3 p-4 sm:p-6`}>
        <h2 id="post-text" className="text-base font-semibold text-zk-text">Your post</h2>
        <label htmlFor="earn-post" className="sr-only">Your post</label>
        <textarea
          id="earn-post"
          rows={3}
          className={agentsInputClass}
          defaultValue={`I'm helping small businesses get websites and apps built by AI agents on Ziki. You approve everything before it goes live. Need something built or fixed? ${EARN_LINK}`}
        />
        <div className="flex flex-wrap gap-2">
          {["Copy", "Post on X", "Post on LinkedIn", "WhatsApp status"].map((label) => (
            <button key={label} type="button" className={agentsSecondaryBtn}>{label}</button>
          ))}
        </div>
      </section>
      <section aria-labelledby="post-proof" className={`${agentsSurface} space-y-3 p-4 sm:p-6`}>
        <h2 id="post-proof" className="text-base font-semibold text-zk-text">Paste the link to your post</h2>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="earn-post-link" className="sr-only">Link to your post</label>
          <input id="earn-post-link" placeholder="https://x.com/you/status/…" className={`${agentsInputClass} min-w-60 flex-1`} />
          <button type="button" className={agentsPrimaryBtn}>Done</button>
        </div>
        <p className={agentsMutedClass}>Someone checks it&apos;s live, then the money lands. For a WhatsApp status, paste a screenshot instead.</p>
      </section>
      <p className="flex flex-wrap items-center gap-2 text-sm text-zk-text2">
        <span className={agentsChipClass}>{EARN_LINK}</span> is your link. {done ? EARN_POST_OPENS : 0} people have opened it.
        <Link href="/earn/people" className={agentsLink}>See who</Link>
      </p>
    </>
  );
}
