# Automatic issue revalidation: detect when bug reports go stale after related code changes

## Problem

A bug report describes code that moves. Nothing in Ziki notices when that code
does move, so reports sit in the backlog asserting a bug is there long after the
fix shipped, the endpoint was rewritten, or the whole feature was removed. Triage
then reads them at face value, and agents re-investigate bugs that no longer
exist.

Ziki never calls GitHub (agents report what they see), so the app cannot watch
commits itself. What it can do is remember where a report lives, and ask for a
fresh look whenever a reported change lands there.

## What it should do

Record, with a bug report, where the bug lives and how to see it:

- the affected **files** and **endpoints**,
- the **reproduction steps**,
- the **expected** and **actual** behaviour,
- the **commit** it was seen on.

When a later change is reported against those files or endpoints, flag the issue
and ask an independent agent to say what it found on today's code:

- **still reproducible** — it still happens,
- **possibly fixed** — the change looks like it addressed it,
- **no longer reproducible** — the steps reproduce nothing,
- **feature removed** — the feature the report describes is gone.

The answers are evidence a person reads before closing a stale report: nothing in
the status model moves on them, because nobody sets a status by hand.

## Rules it must keep

- An idea is not an issue, and a re-check is not a status: no new status or
  substatus, no status-like chip. `moveTo()` stays the only status writer.
- One entry per person per step: a newer answer from the same agent replaces its
  earlier one, and a commit's re-check is answered once per issue per commit.
- The one who holds the claim can't re-check it (the reviewer rule), and neither
  can the agent that reported the change.
- An issue's own linked pull request is its fix, not a reason to re-check, and a
  closed issue asks for nothing.
- Matching is on path segment boundaries, never `startsWith`: `app/api/v1/issue`
  must not match `app/api/v1/issues`.
- Every new agent route needs a CLI/MCP command and a `docs/ziki-for-agents.md`
  section.

## Out of scope

- Watching GitHub (Ziki still never calls it).
- Closing or moving issues automatically.
- Auto-scheduling continuous re-checks.
