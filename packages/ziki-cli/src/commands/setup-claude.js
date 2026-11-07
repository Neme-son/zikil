import fs from "node:fs";
import os from "node:os";
import { CLAUDE_SETTINGS_PATH, buildMcpAddCommand, buildDenyRules, mergeSettingsDeny } from "../adapters/claude.js";
import { resolveMcpServerPath } from "../mcp.js";
import { classifyFile, realIo, applyPlan } from "../setup/plan.js";
import { resolveConfigPath, loadConfig } from "../config/store.js";
import { assertServerRule } from "./login.js";
import { formatPlan } from "./setup-opencode.js";

export const EXPERIMENTAL_NOTE = "experimental: generated from docs, not yet verified against a live Claude. Check the command and snippet before you trust them.";

export function buildClaudePlan({ home, serverUrl, mcpServerPath, io = realIo() }) {
  const settingsPath = CLAUDE_SETTINGS_PATH(home);
  const target = io.readTarget(settingsPath);
  const rules = buildDenyRules();
  let existing = null;
  if (target.kind === "file") {
    try {
      existing = JSON.parse(target.text);
    } catch {
      return {
        files: [
          {
            path: settingsPath,
            absolutePath: settingsPath,
            status: "blocked",
            reason: "unparseable",
            requiresConfirmation: false,
            desiredText: null,
            existingExists: true,
            detail: "settings.json is not valid JSON; fix it by hand first",
          },
        ],
      };
    }
  }
  const desired = `${JSON.stringify(mergeSettingsDeny(existing, rules), null, 2)}\n`;
  const classified = classifyFile(target, desired, null);
  return {
    files: [
      {
        path: settingsPath,
        absolutePath: settingsPath,
        ...classified,
        desiredText: desired,
        existingExists: target.kind !== "absent",
      },
    ],
    mcpAddCommand: buildMcpAddCommand({ serverPath: mcpServerPath }),
  };
}

function formatClaudePlan(plan) {
  const lines = [EXPERIMENTAL_NOTE, "", "1. Attach the server (run by hand; this CLI never shells to `claude`):", `   ${plan.mcpAddCommand}`, "", "2. Restrict submission tools (apply writes this file):", formatPlan(plan)];
  return lines.join("\n");
}

export async function cmdSetupClaude({ apply = false, yes = false, confirm = [], server, mcpServer } = {}, { home = os.homedir(), root = process.cwd() } = {}) {
  let serverUrl = server;
  if (!serverUrl) {
    let config;
    try {
      config = loadConfig(resolveConfigPath());
    } catch {
      return { code: 1, text: "not paired; run `ziki-cli login` first (or pass --server)\n" };
    }
    serverUrl = config.url;
  }
  try {
    serverUrl = assertServerRule(serverUrl);
  } catch (error) {
    return { code: 1, text: `${error.message}\n` };
  }
  const serverPath = resolveMcpServerPath({ flag: mcpServer, env: process.env, cliRoot: root });
  try {
    const stat = fs.lstatSync(serverPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("not a file");
    }
  } catch {
    return { code: 1, text: `MCP server missing at ${serverPath}; rebuild the bundle (npm run prepack) or pass --mcp-server\n` };
  }
  const plan = buildClaudePlan({ home, serverUrl, mcpServerPath: serverPath });
  if (!apply) {
    return { code: 0, text: `${formatClaudePlan(plan)}\n` };
  }
  if (yes !== true) {
    throw new Error("refusing to write without approval; re-run with --apply --yes (plus --confirm <path> for the existing file)");
  }
  const confirmed = new Set(confirm);
  const changed = plan.files.filter((file) => file.status !== "unchanged");
  const missing = changed.filter((file) => file.requiresConfirmation && !confirmed.has(file.path));
  if (missing.length > 0) {
    throw new Error(`refusing to overwrite without confirmation; re-run with --confirm "${missing[0].path}"`);
  }
  const entry = changed.find((file) => file.existingExists);
  if (entry) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(entry.absolutePath, `${entry.absolutePath}.ziki-backup-${stamp}`);
  }
  const written = applyPlan(plan, { confirm, io: realIo() });
  return { code: 0, text: `apply wrote settings only; still run by hand: ${plan.mcpAddCommand}\nwrote ${written.length} file(s)\n` };
}
