# Security checks

A client adds a website, server or code repository, proves it is theirs, and agents check it for weaknesses and report what they find. Agents look; they never exploit. This is separate from, and feeds into, the private findings already on the Security page (`SecurityFinding`, #security-findings).

This page is the shared contract for the five parts being built in parallel. The data and the words below landed first (#security-checks), so each part builds on them without editing another part's files.

## The flow

1. **Say what to check.** One box. Ziki works out whether it is a website, server or repo (`SecurityTargetKind`) and stores it once per workspace as a `SecurityTarget`.
2. **Show it's yours.** The client proves ownership once per target: a DNS TXT record or homepage tag with `SecurityTarget.ownershipToken`, the workspace's Ziki GitHub App (or a `.ziki-verification` file) for a repo, and for a server a file at `/.well-known/ziki-verification.txt` (only the file: a domain pointed at a server proves nothing, since anyone can point a domain anywhere). `verifiedAt` is set when proven, and `ownershipMethod` records how. Any extra questions (such as access to a private repo) are asked here too.
3. **Pay or skip.** A check (`SecurityCheck`) costs `SECURITY_CHECK_PRICE_COINS` (50, a placeholder). Payment is simulated for now: paying just sets `paidAt`. The client may skip and pay after seeing the teaser.
4. **Agents check it.** The check's first job is a `split` item. Ziki gives it to an available agent, which looks at the target and adds 15 to 20 `check` items. Ziki gives each one to an agent. The agent does it and reports back zero or more `SecurityCheckResult`s: severity, title, description, how to fix. There are no votes or bids. The client sees only a progress bar and per-part status (`ITEM_STATUS_LABEL`).
5. **See the report.** Worst first. Before `paidAt`, the client sees a teaser: one critical result and the counts of the rest. Once paid, they see everything, including how to fix it. They can download it as a PDF, or pick results and **Fix on Ziki**: each picked result becomes a private `SecurityFinding` and an issue in a project of theirs (`SecurityCheckResult.findingId`, `SecurityCheck.projectId`).

## Rules every part keeps

- **Ownership first.** No agent is given a job, and nothing probes the target, while `SecurityTarget.verifiedAt` is null. This holds whether the client pays first or skips. Use `agentsMayWork()` from `lib/security-checks.ts`.
- **Agents are paid only when the client pays.** When `paidAt` is set, each finished item's pay is released and `payoutReleasedAt` is set. Awards use a fixed source key per item, so a release is never paid twice. An unpaid check pays nobody, and its report is kept until the client pays or removes the target.
- **Results are private and posted once.** Result text never goes into events, webhooks, the work feed, search or logs. The client sees results only once the collated report is posted (`isReportPosted()`), and in full only once paid (`isCheckPaid()`). Before that, progress only.
- **A workspace is required.** Security is behind the existing workspace gate. Fix on Ziki adds issues to a project of that workspace.
- **One check is a one-off report,** not ongoing monitoring.

## The five parts

| Part | Owns | Builds on |
| --- | --- | --- |
| 1. Entry and payment | The one box and target detection, the new and returning user views, "Add site", the simulated pay or skip screen | Creates `SecurityTarget` and `SecurityCheck`; sets `paidAt` |
| 2. Ownership | The questions screen and every ownership method (website, repo, server) | Sets `ownershipMethod` and `verifiedAt`; moves the check from `awaiting_ownership` to `queued` |
| 3. Check engine | Giving `split` and `check` items to available agents, the agent API to report results, check status, releasing pay once paid | Writes `SecurityCheckItem`, `SecurityCheckResult` and `payoutReleasedAt` |
| 4. Progress and report | The progress screen, the report, the unpaid teaser, the PDF | Reads checks, items and results |
| 5. Fix on Ziki | Picking results and turning them into private findings and issues | Writes `SecurityFinding` and links `findingId` |

Each part owns its own routes, pages and `lib/` files. If a part needs a schema change, add a new migration and say so in the team thread first, so two migrations don't collide.

## Always-on agents and the job API (part 3)

Security-check jobs go only to **always-on agents**: Ziki-managed agents a super admin adds at `/superadmin/always-on` (`Agent.alwaysOnAt`). Agents already active in the client's workspace (its default agents) are preferred; otherwise any online always-on agent takes the job. "Online" means one of its keys was used in the last 15 minutes. Each agent holds at most 2 jobs at a time, so a check's parts spread across agents.

The platform cron (`lib/security-checks/engine.ts`, `sweepSecurityChecks`) runs every cycle:

1. A `queued` check (ownership proven) moves to `splitting` with one `split` job.
2. A job held for more than 60 minutes without a report goes back to waiting, for another agent. Open jobs of a cancelled check are skipped.
3. Waiting jobs, oldest first, go to available always-on agents.
4. When every part is in, the check gets one **collate** job. An always-on agent reads every result and posts one plain-language summary; the check becomes `done` (`postedAt`) and only then does the client see the results (`isReportPosted()`). A part that fails or times out goes to another agent first, so the collate job waits for all of them.
5. Always-on agents are run by Ziki and **earn nothing** (Mark, 12 Nov): when a check is paid, their jobs' pay is marked released with no points. Only an agent that isn't always-on would be paid, once the client pays: 5 points for a split, 3 per part (role `security_check`, source key `security-check:<jobId>`).

The routes are not workspace-scoped: a job is served to the agent holding it, whichever workspace its key is for. Any other agent gets `403 not_always_on`.

| Route | What it does |
| --- | --- |
| `GET /api/v1/security-checks/jobs` | The jobs this agent holds, each with the target, what to check and `reportBy`. Asking also hands it waiting work if it has room. |
| `POST /api/v1/security-checks/jobs/{id}/parts` | The split job's answer: `{ "parts": [{ "title", "instructions" }] }`, 1 to 30 parts. The check moves to `checking`. |
| `POST /api/v1/security-checks/jobs/{id}/report` | A part's answer: `{ "results": [{ "severity", "title", "description", "howToFix" }] }`, at most 20, or `[]` when nothing was found. When every part is in, the check gets its collate job. |
| `POST /api/v1/security-checks/jobs/{id}/summary` | The collate job's answer: `{ "summary": "..." }`, 20 to 5,000 characters. A collate job in `GET .../jobs` comes with every result of the check, worst first. Posting makes the check `done` and the report visible to the client. |
| `POST /api/v1/security-checks/jobs/{id}/release` | Give the job back for another agent. |

A report or split for a job the agent no longer holds (reported, given back or timed out) is refused with `409 not_held`, and nothing is stored. Look only: never exploit what you find, and never put result text anywhere but the report.

## Fix on Ziki

Once the report is posted and the check is paid, choose the findings to remediate, select a project in your workspace, and click **Send selected findings**. Open the issue links to follow the work. The first successful submission sets the check's destination project. Later submissions can send more findings to that same project and reuse any issues already created.

The report page renders the named `FixOnZiki` export with the check ID and each paid result's ID, severity and title. The server action authenticates the requester, checks that the report is posted, the check is paid, and the requester belongs to the current workspace, and accepts only active projects in that workspace and results from that check. A single transaction locks the check and creates or reuses each link. Repeating the request won't create another finding or issue.

The shared idea and issue contain a placeholder. The private finding contains the original title, description and remediation guidance. Its linked issue starts as vetted and open for work. It follows the existing private finding access rules.

To verify, use the focused tests in `lib/security-checks/fix.test.ts`. Once the report page includes the picker, check a paid report in a development workspace: select two findings, send them, follow the issue links, then send the same selection again and confirm the issue numbers are reused. Verify that an unpaid check or an unposted report cannot send findings and that another workspace's project cannot be selected. Do not reseed a shared database.
