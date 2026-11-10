import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDoctor } from "./commands/doctor.js";
import { renderStatus } from "./commands/status.js";
import { cmdLogin } from "./commands/login.js";
import { connectProject } from "./commands/connect.js";
import { cmdWork } from "./commands/work.js";
import { cmdSetupOpencode, packageRoot } from "./commands/setup-opencode.js";
import { cmdSetupCodex } from "./commands/setup-codex.js";
import { cmdSetupClaude } from "./commands/setup-claude.js";
import { resolveMcpServer } from "./mcp.js";
import { resolveConfigPath, loadConfig, apiFetch } from "./config/store.js";
import { cmdInit } from "./commands/init.js";
import { PROGRAM_NAME } from "./program.js";

const HELP = `${PROGRAM_NAME} — thin client for the Ziki Local Agent Environment

Usage: ${PROGRAM_NAME} <command> [options]

Commands:
  init            guided first-time setup (login, connect, setup-opencode)
  login           pair this machine with a Ziki account
  connect         link the current repository to a Ziki project
  setup-opencode  install the OpenCode adapter (plan first, write on approval)
  work            show your agent's current Ziki work
  status          show identity, project, work gate and readiness
  doctor          check the local environment
  sync            refresh managed files to the installed versions
  setup-codex     install the Codex adapter (experimental, plan first)
  setup-claude    install the Claude adapter (experimental, plan first)
  help            show this text
`;

function pairingFileState() {
  const configPath = resolveConfigPath();
  try {
    const stat = fs.statSync(configPath);
    return { exists: stat.isFile(), path: configPath };
  } catch {
    return { exists: false, path: configPath };
  }
}

function opencodeConfigState() {
  const configPath = path.join(os.homedir(), ".config", "opencode", "opencode.json");
  try {
    return { exists: fs.statSync(configPath).isFile(), path: configPath };
  } catch {
    return { exists: false, path: configPath };
  }
}

async function cmdDoctor() {
  const pairing = pairingFileState();
  let serverUrl = "http://localhost:3001";
  if (pairing.exists) {
    try {
      serverUrl = loadConfig(pairing.path).url ?? serverUrl;
    } catch {
      // A broken pairing file is itself a finding; doctor keeps going.
    }
  }
  const report = await runDoctor({
    nodeVersion: process.version,
    pairingFile: pairing,
    platform: process.platform,
    fetchImpl: globalThis.fetch,
    serverUrl,
    opencodeConfig: opencodeConfigState(),
    mcpServer: resolveMcpServer({ mcpPath: undefined, env: process.env, cliRoot: packageRoot(), cwd: process.cwd() }),
  });
  const lines = report.checks.map((c) => `${c.ok ? (c.warning ? "warn" : "pass") : "FAIL"} ${c.name}: ${c.detail}`);
  return { code: report.ok ? 0 : 1, text: `${lines.join("\n")}\n` };
}

async function cmdStatus() {
  const configPath = resolveConfigPath();
  let config;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    return { code: 1, text: `${error.message}\n` };
  }
  let res;
  try {
    res = await apiFetch(config, "/api/v1/agents/me", {});
  } catch (error) {
    return { code: 1, text: `server unreachable: ${error.message || error}\n` };
  }
  if (res.ok !== true) {
    return { code: 1, text: `server answered ${res.status}\n` };
  }
  return { code: 0, text: renderStatus(await res.json()) };
}

function flagValue(argv, names) {
  for (let i = 0; i < argv.length; i += 1) {
    if (names.includes(argv[i]) && i + 1 < argv.length) {
      return argv[i + 1];
    }
  }
  return undefined;
}

function hasFlag(argv, names) {
  return argv.some((a) => names.includes(a));
}

function flagValues(argv, names) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (names.includes(argv[i]) && i + 1 < argv.length) {
      out.push(argv[i + 1]);
    }
  }
  return out;
}

async function cmdConnect(argv) {
  const selector = flagValue(argv, ["--project", "-p"]);
  if (!selector) {
    return { code: 2, text: "connect needs --project <slug-or-id>\n" };
  }
  let config;
  try {
    config = loadConfig(resolveConfigPath());
  } catch (error) {
    return { code: 1, text: `${error.message}\n` };
  }
  try {
    const pointer = await connectProject(config, selector, {
      cwd: process.cwd(),
      fetchImpl: globalThis.fetch,
      force: hasFlag(argv, ["--force"]),
    });
    return { code: 0, text: `linked to ${pointer.projectSlug ?? pointer.projectId} (org: ${pointer.org ?? "?"})\n` };
  } catch (error) {
    return { code: 1, text: `${error.message}\n` };
  }
}

export async function run(argv, _ctx) {
  const [name, ...rest] = argv;
  switch (name) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return { code: 0, text: HELP };
    case "doctor":
      return cmdDoctor();
    case "status":
      return cmdStatus();
    case "login": {
      try {
        return await cmdLogin({
          server: flagValue(rest, ["--server"]),
          name: flagValue(rest, ["--name", "-n"]),
          model: flagValue(rest, ["--model"]),
          level: flagValue(rest, ["--level"]),
          open: !hasFlag(rest, ["--no-open"]),
        });
      } catch (error) {
        return { code: 1, text: `${error.message}\n` };
      }
    }
    case "init":
      try {
        return await cmdInit({ server: flagValue(rest, ["--server"]) });
      } catch (error) {
        return { code: 1, text: `${error.message}\n` };
      }
    case "connect":
      return cmdConnect(rest);
    case "work":
      try {
        return await cmdWork({ project: flagValue(rest, ["--project", "-p"]), json: hasFlag(rest, ["--json"]) });
      } catch (error) {
        return { code: 1, text: `${error.message}\n` };
      }
    case "setup-opencode":
      return cmdSetupOpencode({
        apply: hasFlag(rest, ["--apply"]),
        yes: hasFlag(rest, ["--yes"]),
        confirm: flagValues(rest, ["--confirm"]),
        replaceZiki: hasFlag(rest, ["--replace-ziki"]),
        persona: flagValue(rest, ["--persona"]) ?? "keep",
        server: flagValue(rest, ["--server"]),
        mcpPath: flagValue(rest, ["--mcp-path"]),
      });
    case "sync":
      return cmdSetupOpencode({
        apply: hasFlag(rest, ["--apply"]),
        yes: hasFlag(rest, ["--yes"]),
        confirm: flagValues(rest, ["--confirm"]),
        replaceZiki: hasFlag(rest, ["--replace-ziki"]),
        persona: "keep",
        server: flagValue(rest, ["--server"]),
        mcpPath: flagValue(rest, ["--mcp-path"]),
      });
    case "setup-codex":
      try {
        return await cmdSetupCodex({
          apply: hasFlag(rest, ["--apply"]),
          yes: hasFlag(rest, ["--yes"]),
          confirm: flagValues(rest, ["--confirm"]),
          server: flagValue(rest, ["--server"]),
          mcpPath: flagValue(rest, ["--mcp-path"]),
        });
      } catch (error) {
        return { code: 1, text: `${error.message}\n` };
      }
    case "setup-claude":
      try {
        return await cmdSetupClaude({
          apply: hasFlag(rest, ["--apply"]),
          yes: hasFlag(rest, ["--yes"]),
          confirm: flagValues(rest, ["--confirm"]),
          server: flagValue(rest, ["--server"]),
          mcpPath: flagValue(rest, ["--mcp-path"]),
        });
      } catch (error) {
        return { code: 1, text: `${error.message}\n` };
      }
    default:
      return { code: 2, text: `unknown command: ${name}\n\n${HELP}` };
  }
}
