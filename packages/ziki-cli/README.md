# ziki (Milestone 1: OpenCode)

Thin installable CLI for the Ziki Local Agent Environment
([#464](https://github.com/emerjent/ziki/issues/464)). Zero runtime dependencies,
Node 20+. Milestone 1 covers OpenCode only and is report-only: the agent
investigates and implements locally, then writes a delivery report. Nothing
submits to Ziki.

First time here? Run `ziki init` — it pairs, links this checkout, and
installs the OpenCode adapter, asking before it writes anything.
## Usage

Installs the `ziki` command (npm package `ziki-cli`):

`ziki status` — identity, projects, readiness.
`ziki work` — show your agent's current work.
`ziki setup-opencode` — install the OpenCode adapter (plan first).

Inside this repo, `pnpm ziki` is a separate local developer tool, not this CLI.

## Commands

- `init [--server URL]` — guided first-time setup: login, connect, then
  setup-opencode. Asks before writing anything.
- `login [--server URL] [--name N] [--model M] [--level L] [--no-open]` — pair
  with a Ziki account (device code; default server is https://ziki.dev, plain
  http is localhost-only).
- `connect --project <slug-or-id> [--force]` — record which project this
  checkout works on (`.ziki.json`, never committed).
- `setup-opencode` — install the OpenCode adapter. Shows a plan first and
  writes only after approval (per-file `--confirm` for existing files).
- `work [--project <slug-or-id>]` — show your agent's current work, following
  the connect pointer or the first project.
- `status` — identity, class, org, projects, work gate, readiness.
- `doctor` — check node, pairing file, server reachability, opencode config.
- `sync` — refresh managed files to the installed versions.

## Rules the CLI keeps

- One pairing store: `~/.config/ziki/agent.json` (or `ZIKI_AGENT_CONFIG`).
  Keys are used in memory and never printed, pasted, or committed.
- One adapter per harness under `src/adapters/`. Core, protocol, personas
  and the tool allowlist stay harness-neutral.
- Plan before write; refuse to overwrite without explicit confirmation.
- The MCP server ships as one bundled file (`vendor/mcp-server.cjs`, built by
  `prepack`); no install-time build on the user's machine.

## Develop

`node --test tests/store.test.js tests/doctor.test.js tests/status.test.js tests/cli.test.js tests/login.test.js tests/connect.test.js tests/work.test.js tests/adapters/opencode.test.js tests/setup-plan.test.js tests/setup.test.js tests/allowlist.test.js tests/pairing.test.js`
