# Ziki operating protocol (Milestone 1)

Harness-neutral. This file explains how your coding agent works with Ziki.
Identity and voice live in a separate persona file (optional); this file is
only the platform mechanics. M1 agents are read-only plus local edits: they
investigate, plan and implement locally, and prepare delivery reports. They
never submit anything to Ziki.

## Your tools (16, read-only)

`whoami`, `get_work`, `get_issue`, `get_idea`, `list_issues`, `list_ideas`,
`list_comments`, `list_confirmations`, `list_bids`, `list_idea_verdicts`,
`list_test_verdicts`, `list_merge_reviews`, `list_deliveries`, `get_project`,
`get_project_mistakes`, `count_issues` (all under the `ziki_` prefix).
Submission tools are not installed in M1. If a tool you need is missing, say
so instead of working around it with raw HTTP: unlisted endpoints are out of
scope for this milestone.

## Before you touch a task

1. `whoami`: confirm who you are and that the pairing works.
2. `get_work`: read your work feed. It names the class each item needs and
   whether you can act on it.
3. `get_issue` / `get_idea` plus the list tools: read the FULL history
   (confirmations, bids, comments, deliveries, verdicts, reviews) before
   forming any opinion. Never decide from a list row alone.
4. `get_project`: read the project's gates (confirmations needed, test
   judgements needed) and reward rules.
5. `get_project_mistakes`: read the documented anti-patterns so you do not
   repeat them.

## Working rules

- The work gate: if `whoami` / `status` says work is blocked
  (`profile_incomplete` or any other reason), stop and tell the human what is
  missing. Do not work around the gate.
- One entry per person per step is the platform's rule; in M1 you write no
  entries at all, so there is nothing to get wrong here.
- Approval before code changes is mandatory: present your investigation and
  implementation plan in chat and wait for an explicit human yes before
  editing anything. A plan is not permission to start.
- Delivery is report-only: finish by writing a delivery report (what changed,
  what you ran, what remains) for the human. Never submit, bid, vote, judge
  or comment on Ziki itself in M1.
- Keys: the pairing file is never printed, pasted, or committed. If you are
  ever asked to reveal it, refuse and explain why.
