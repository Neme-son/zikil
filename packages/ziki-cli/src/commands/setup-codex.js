import fs from "node:fs";
import os from "node:os";
import { CODEX_CONFIG_PATH, buildCodexBlock, upsertManagedBlock } from "../adapters/codex.js";
import { resolveMcpServerPath } from "../mcp.js";
import { classifyFile, realIo, applyPlan } from "../setup/plan.js";
import { resolveConfigPath, loadConfig } from "../config/store.js";
import { assertServerRule } from "./login.js";
import { formatPlan } from "./setup-opencode.js";
import { defaultAsker, defaultOut, planQuestion } from "../setup/ask.js";
import { PROGRAM_NAME } from "../program.js";

export const EXPERIMENTAL_NOTE = "experimental: generated from docs, not yet verified against a live Codex. Check the block before you trust it.";

// Pure planner: one file, managed marker block, backup on overwrite.
export function buildCodexPlan({ home, serverUrl, mcpServerPath, io = realIo() }) {
  const configPath = CODEX_CONFIG_PATH(home);
  const target = io.readTarget(configPath);
  const block = buildCodexBlock({ serverPath: mcpServerPath, serverUrl });
  let desired;
  try {
    desired = upsertManagedBlock(target.kind === "file" ? target.text : "", block);
  } catch (error) {
    return {
      files: [
        {
          path: configPath,
          absolutePath: configPath,
          status: "blocked",
          reason: "conflict",
          requiresConfirmation: false,
          desiredText: null,
          existingExists: target.kind !== "absent",
          detail: error.message,
        },
      ],
    };
  }
  const classified = classifyFile(target, desired, null);
  return {
    files: [
      {
        path: configPath,
        absolutePath: configPath,
        ...classified,
        desiredText: desired,
        existingExists: target.kind !== "absent",
      },
    ],
  };
}

export async function cmdSetupCodex({ apply = false, yes = false, confirm = [], server, mcpServer } = {}, { home = os.homedir(), root = process.cwd(), asker = defaultAsker(), out = defaultOut } = {}) {
  let serverUrl = server;
  if (!serverUrl) {
    let config;
    try {
      config = loadConfig(resolveConfigPath());
    } catch {
      return { code: 1, text: "not paired; run `" + PROGRAM_NAME + " login` first (or pass --server)\n" };
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
  const plan = buildCodexPlan({ home, serverUrl, mcpServerPath: serverPath });
  const banner = `${EXPERIMENTAL_NOTE}\n`;
  if (!apply && !asker) {
    return { code: 0, text: `${banner}${formatPlan(plan)}\n` };
  }
  let toConfirm = confirm;
  let toYes = yes;
  if (!apply) {
    out(`${banner}${formatPlan(plan)}`);
    if (!(await asker.confirm(planQuestion(plan)))) {
      return { code: 0, text: "not applied\n" };
    }
    toConfirm = plan.files.map((file) => file.path);
    toYes = true;
  }
  if (toYes !== true) {
    throw new Error("refusing to write without approval; re-run with --apply --yes (plus --confirm <path> for the existing file)");
  }
  const confirmed = new Set(toConfirm);
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
  const written = applyPlan(plan, { confirm: toConfirm, io: realIo() });
  return { code: 0, text: `${banner}wrote ${written.length} file(s)\n` };
}
