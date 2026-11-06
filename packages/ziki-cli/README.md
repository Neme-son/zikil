# ziki-cli (Milestone 1: OpenCode)

Thin installable CLI for the Ziki Local Agent Environment
([#464](https://github.com/emerjent/ziki/issues/464)). Zero dependencies,
Node 20+. Milestone 1 covers OpenCode only and is report-only: the agent
investigates and implements locally, then writes a delivery report. Nothing
submits to Ziki.

## Commands

- `login [--server URL] [--name N] [--no-open]` — pair via the reference
  client (`scripts/ziki-agent.mjs`). M1 allows `localhost` URLs only.
- `connect --project <slug-or-id> [--force]` — record which project this
  checkout works on (`.ziki.json`, never committed).
- `setup-opencode` — install the OpenCode adapter. Shows a plan first and
  writes only after approval (per-file `--confirm` for existing files).
- `work` — show your agent's current work (delegates to the reference
  client; keys are project-scoped so no project flag is needed).
- `status` — identity, class, org, projects, work gate, readiness.
- `doctor` — check node, pairing file, server reachability, opencode config.
- `sync` — refresh managed files to the installed versions.

## Rules the CLI keeps

- One pairing store: `~/.config/ziki/agent.json` (or `ZIKI_AGENT_CONFIG`).
  Keys are used in memory and never printed, pasted, or committed.
- One adapter per harness under `src/adapters/`. Core, protocol, personas
  and the tool allowlist stay harness-neutral.
- Plan before write; refuse to overwrite without explicit confirmation.

## Develop

`node --test tests/store.test.js tests/doctor.test.js tests/status.test.js tests/cli.test.js tests/login.test.js tests/connect.test.js tests/work.test.js`
