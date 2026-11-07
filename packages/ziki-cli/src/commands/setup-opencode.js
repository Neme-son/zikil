import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPENCODE_GLOBAL_DIR, buildMcpBlock, buildToolsMap, resolveMcpServerPath, mergeOpencodeConfig } from "../adapters/opencode.js";
import { classifyFile, digest, realIo, applyPlan } from "../setup/plan.js";
import { resolveConfigPath, loadConfig } from "../config/store.js";
import { assertServerRule } from "./login.js";

const SKILL_NAME = "ziki-work";
const MANIFEST_NAME = ".ziki-manifest.json";
const MAX_PERSONA_BYTES = 64 * 1024;

export function packageRoot() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function readTemplate(root, name) {
  return fs.readFileSync(path.join(root, "templates", name), "utf8");
}

function resolvePersona({ persona, root }) {
  if (persona === undefined || persona === "keep") {
    return null;
  }
  if (persona === "example") {
    return readTemplate(root, "example-persona.md");
  }
  let stat;
  try {
    stat = fs.lstatSync(persona);
  } catch {
    throw new Error(`persona file not found: ${persona}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`persona must be a regular file: ${persona}`);
  }
  if (stat.size > MAX_PERSONA_BYTES) {
    throw new Error(`persona file too large (max 64 KB): ${persona}`);
  }
  return fs.readFileSync(persona, "utf8");
}

function blockedEntry(absolutePath, reason, detail, existingExists) {
  return {
    path: absolutePath,
    absolutePath,
    status: "blocked",
    reason,
    requiresConfirmation: false,
    desiredText: null,
    existingExists,
    detail,
  };
}

// Pure planner: every input is explicit, every write goes through the plan.
// JSONC and unparseable configs block with instructions instead of edits.
export function buildSetupPlan({ home, cliRoot, serverUrl, mcpServerPath, persona = "keep", io = realIo() }) {
  const globalDir = OPENCODE_GLOBAL_DIR(home);
  const skillDir = path.join(globalDir, "skills", SKILL_NAME);
  const manifestPath = path.join(skillDir, MANIFEST_NAME);
  const block = buildMcpBlock({ serverPath: mcpServerPath, serverUrl }).ziki;
  const tools = buildToolsMap();

  const manifestTarget = io.readTarget(manifestPath);
  let recorded = {};
  if (manifestTarget.kind === "file") {
    try {
      const doc = JSON.parse(manifestTarget.text);
      if (doc && typeof doc.files === "object") {
        recorded = doc.files;
      }
    } catch {
      recorded = {};
    }
  }

  const files = [];
  const pushFile = (absolutePath, desiredText) => {
    const target = io.readTarget(absolutePath);
    const classified = classifyFile(target, desiredText, recorded[absolutePath] ?? null);
    files.push({
      path: absolutePath,
      absolutePath,
      ...classified,
      desiredText,
      existingExists: target.kind !== "absent",
    });
  };

  const configPath = path.join(globalDir, "opencode.json");
  const configTarget = io.readTarget(configPath);
  if (configTarget.kind === "absent" && io.readTarget(path.join(globalDir, "opencode.jsonc")).kind !== "absent") {
    files.push(blockedEntry(configPath, "jsonc", `uses opencode.jsonc, which this CLI never edits. Merge this block by hand under "mcp", plus the tool denials under "tools":\n${JSON.stringify({ ziki: block }, null, 2)}`, false));
  } else if (configTarget.kind === "absent") {
    pushFile(configPath, `${JSON.stringify({ mcp: { ziki: block }, tools }, null, 2)}\n`);
  } else if (configTarget.kind === "file") {
    let existing = null;
    try {
      existing = JSON.parse(configTarget.text);
    } catch {
      existing = null;
    }
    if (existing === null || typeof existing !== "object") {
      files.push(blockedEntry(configPath, "invalid-json", "opencode.json is not valid JSON; fix or remove it first", true));
    } else {
      try {
        const merged = mergeOpencodeConfig(existing, { ziki: block }, tools);
        pushFile(configPath, `${JSON.stringify(merged, null, 2)}\n`);
      } catch (error) {
        files.push(blockedEntry(configPath, "conflict", error.message, true));
      }
    }
  } else {
    files.push(blockedEntry(configPath, configTarget.kind, `refusing to touch ${configTarget.kind}; remove or replace it first`, true));
  }

  pushFile(path.join(skillDir, "SKILL.md"), readTemplate(cliRoot, "opencode-skill.md"));
  pushFile(path.join(skillDir, "protocol.md"), readTemplate(cliRoot, "ziki-protocol.md"));
  pushFile(path.join(globalDir, "commands", `${SKILL_NAME}.md`), readTemplate(cliRoot, "opencode-command.md"));
  const personaText = resolvePersona({ persona, root: cliRoot });
  if (personaText !== null) {
    pushFile(path.join(skillDir, "persona.md"), personaText);
  }

  const manifestDesired = { version: 1, files: {} };
  for (const file of files) {
    if (file.desiredText !== null) {
      manifestDesired.files[file.absolutePath] = `sha256:${digest(file.desiredText)}`;
    }
  }
  const manifestText = `${JSON.stringify(manifestDesired, null, 2)}\n`;
  const manifestStatus = manifestTarget.kind === "file" && manifestTarget.text === manifestText
    ? { status: "unchanged", reason: null }
    : { status: manifestTarget.kind === "absent" ? "create" : "update", reason: "generated" };
  files.push({
    path: manifestPath,
    absolutePath: manifestPath,
    ...manifestStatus,
    requiresConfirmation: false,
    desiredText: manifestText,
    existingExists: manifestTarget.kind !== "absent",
  });

  return { files };
}

export function formatPlan(plan) {
  const lines = plan.files.map((file) => {
    const reason = file.reason ? ` (${file.reason})` : "";
    const confirm = file.requiresConfirmation ? " [needs --confirm]" : "";
    return `${file.status}  ${file.path}${reason}${confirm}`;
  });
  const needConfirm = plan.files.filter((f) => f.requiresConfirmation && f.status !== "unchanged");
  if (needConfirm.length > 0) {
    lines.push(`re-run with: --apply --yes ${needConfirm.map((f) => `--confirm "${f.path}"`).join(" ")}`);
  } else if (plan.files.some((f) => f.status !== "unchanged")) {
    lines.push("re-run with: --apply --yes");
  }
  return lines.join("\n");
}

export function applySetupPlan(plan, { confirm = [], yes = false, io = realIo(), now = () => new Date() } = {}) {
  if (yes !== true) {
    throw new Error("refusing to write without approval; re-run with --apply --yes (plus --confirm <path> for existing files)");
  }
  const confirmed = new Set(confirm);
  const changed = plan.files.filter((file) => file.status !== "unchanged");
  const missing = changed.filter((file) => file.requiresConfirmation && !confirmed.has(file.path));
  if (missing.length > 0) {
    const flags = missing.map((file) => `--confirm "${file.path}"`).join(" ");
    throw new Error(`refusing to overwrite without confirmation; re-run with ${flags}`);
  }
  const configEntry = changed.find((file) => file.path.endsWith("opencode.json") && file.existingExists);
  if (configEntry) {
    const stamp = now().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(configEntry.absolutePath, `${configEntry.absolutePath}.ziki-backup-${stamp}`);
  }
  return applyPlan(plan, { confirm, io });
}

export async function cmdSetupOpencode({ apply = false, yes = false, confirm = [], persona = "keep", server, mcpServer } = {}, { home = os.homedir(), root = packageRoot() } = {}) {
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
  let plan;
  try {
    plan = buildSetupPlan({ home, cliRoot: root, serverUrl, mcpServerPath: serverPath, persona });
  } catch (error) {
    return { code: 1, text: `${error.message}\n` };
  }
  if (!apply) {
    return { code: 0, text: `${formatPlan(plan)}\n` };
  }
  try {
    const written = applySetupPlan(plan, { confirm, yes });
    return { code: 0, text: `wrote ${written.length} file(s)\n` };
  } catch (error) {
    return { code: 1, text: `${error.message}\n` };
  }
}
