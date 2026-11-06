## Summary

- Adds a **repro profile** per issue (`POST /api/v1/issues/{id}/repro`): affected
  files and endpoints, reproduction steps, expected and actual behaviour, and the
  commit it was seen on. `IssueRepro` holds one profile per issue; recording it
  again corrects it.
- Adds **code-change reporting** (`POST /api/v1/projects/{id}/code-changes`): an
  agent sends the paths a change touched (from a pull request, commit or diff it
  read — Ziki still never calls GitHub), and Ziki matches them against every open
  issue's profile on segment boundaries. Each match becomes a `revalidate_issue`
  item in the work feed. The issue's own pull request is skipped (it is the fix),
  and reporting the same commit twice asks once (`@@unique([bugId, commitSha])`).
- Adds **re-check answers** (`POST /api/v1/issues/{id}/revalidation`,
  `GET /api/v1/issues/{id}/revalidation`): still reproducible, possibly fixed, no
  longer reproducible, or a feature that is gone, with a summary and a full
  description. The answer is advisory and never moves the issue. The claim holder
  and the agent that reported the change are refused (`403 not_independent`); a
  closed issue asks for nothing (`409 issue_closed`).
- Issue page shows the profile, the re-checks waiting and the answers given;
  events `issue.repro_recorded`, `issue.revalidation_asked` and `issue.revalidated`;
  MCP/CLI tools `ziki_record_repro`, `ziki_report_code_change`,
  `ziki_revalidate_issue`, `ziki_get_revalidation`, documented in
  `docs/ziki-for-agents.md`.
- Migration `20270101000030_issue_revalidation` adds the two enums and two tables
  (migration only; no reseed).

## Test plan

- **Full run** (`pnpm verify:ready`): revision `cc374397` + uncommitted changes,
  input state `319433ce8d96`, **failed**. Lint and typecheck failed on one
  `TS1160`/parse error in `lib/revalidation.ts` (a JSDoc line containing `app/*/`
  closed the comment early); the unit suite ran 58 files / 527 tests with 527
  passing, and 7 files failed to transform for that same parse error.
- **Repairs after it**: rewrote the offending comment; `var` → `const`;
  narrowed the local `fail`/`invalid` helpers (zod's `PropertyKey[]`, `404` status);
  guarded `work.toRevalidate` for hand-built feed fixtures; registered the three
  new body tools in `tests/platform/api-error-contract.test.ts`; gave the code-change
  test a pull request so the own-fix skip is exercised; matched an endpoint's area
  anywhere in a path (`app/api/v1/issues/[id]/…` contains `api/v1/issues`).
- **Targeted recheck** (`pnpm verify:recheck`): input state `bc987e724747`, reran
  lint on the 7 changed files, typecheck, and the 7 affected test files — **all
  passed** (lint clean 14.2 s, typecheck 37.0 s, unit 7 files / 183 tests 7.8 s).
  This is a targeted recheck, not a full pass of the final code.
- **CLI scenarios**: this change adds agent API routes, so CI's `CLI scenarios`
  job covers them; not run locally.
- **Known failures**: none.

🤖 Generated with Codebuff
Co-Authored-By: Codebuff <noreply@codebuff.com>
