import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPENCODE_GLOBAL_DIR, buildMcpBlock, buildToolsMap, resolveMcpServerPath, mergeOpencodeConfig } from "../adapters/opencode.js";
import { classifyFile, digest, realIo, applyPlan } from "../setup/plan.js";
import { resolveConfigPath, loadConfig } from "../config/store.js";
import { assertServerRule } from "./login.js";
import { defaultAsker, defaultOut, planQuestion } from "../setup/ask.js";
import { PROGRAM_NAME } from "../program.js";

const SKILL_NAME = "ziki-work";
const MANIFEST_NAME = ".ziki-manifest.json";
const MAX_PERSONA_BYTES = 64 * 1024;

// Asked in a terminal before a foreign ziki entry is replaced. Scripts pass
// --replace-ziki with --apply --yes --confirm <path> instead.
export const REPLACE_QUESTION = "Replace the existing ziki entry? A backup is made first. [y/N] ";

// Strip // and /* */ comments (block comments become one space so tokens
// never join) and trailing commas. Both passes are string-aware.
export function stripJsonc(text) {
  let noComments = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      noComments += ch;
      i += 1;
      let escaped = false;
      while (i < text.length) {
        const c = text[i];
        noComments += c;
        i += 1;
        if (escaped) {
          escaped = false;
        } else if (c === "\\") {
          escaped = true;
        } else if (c === '"') {
          break;
        }
      }
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        i += 1;
      }
      i += 2;
      noComments += " ";
      continue;
    }
    noComments += ch;
    i += 1;
  }
  let out = "";
  let j = 0;
  while (j < noComments.length) {
    const ch = noComments[j];
    if (ch === '"') {
      out += ch;
      j += 1;
      let escaped = false;
      while (j < noComments.length) {
        const c = noComments[j];
        out += c;
        j += 1;
        if (escaped) {
          escaped = false;
        } else if (c === "\\") {
          escaped = true;
        } else if (c === '"') {
          break;
        }
      }
      continue;
    }
    if (ch === ",") {
      let k = j + 1;
      while (k < noComments.length && /\s/.test(noComments[k])) {
        k += 1;
      }
      if (noComments[k] === "}" || noComments[k] === "]") {
        j += 1;
        continue;
      }
    }
    out += ch;
    j += 1;
  }
  return out;
}

export function parseJsonc(text) {
  return JSON.parse(stripJsonc(text));
}

// Minimal line diff for the plan. shortcut: O(n*m) time and memory, fine
// for small config files; switch to Myers if it ever runs on big files.
export function diffLines(oldText, newText) {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let k = b.length - 1; k >= 0; k -= 1) {
      lcs[i][k] = a[i] === b[k] ? lcs[i + 1][k + 1] + 1 : Math.max(lcs[i + 1][k], lcs[i][k + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let k = 0;
  while (i < a.length && k < b.length) {
    if (a[i] === b[k]) {
      lines.push(`  ${a[i]}`);
      i += 1;
      k += 1;
    } else if (lcs[i + 1][k] >= lcs[i][k + 1]) {
      lines.push(`- ${a[i]}`);
      i += 1;
    } else {
      lines.push(`+ ${b[k]}`);
      k += 1;
    }
  }
  while (i < a.length) {
    lines.push(`- ${a[i]}`);
    i += 1;
  }
  while (k < b.length) {
    lines.push(`+ ${b[k]}`);
    k += 1;
  }
  return lines;
}


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
// Parsable JSONC merges with a warning; unparseable configs block with instructions instead of edits.
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
    const entry = {
      path: absolutePath,
      absolutePath,
      ...classified,
      desiredText,
      existingExists: target.kind !== "absent",
    };
    files.push(entry);
    return entry;
  };

  const configPath = path.join(globalDir, "opencode.json");
  const jsoncPath = path.join(globalDir, "opencode.jsonc");
  const configTarget = io.readTarget(configPath);
  // Merge into whichever config exists, preferring opencode.json; a fresh
  // setup creates plain opencode.json.
  const activePath = configTarget.kind === "absent" ? jsoncPath : configPath;
  const activeTarget = configTarget.kind === "absent" ? io.readTarget(jsoncPath) : configTarget;
  const handMerge = `Merge this block by hand under "mcp", plus the tool denials under "tools":\n${JSON.stringify({ ziki: block }, null, 2)}`;
  if (activeTarget.kind === "absent") {
    pushFile(configPath, `${JSON.stringify({ mcp: { ziki: block }, tools }, null, 2)}\n`);
  } else if (activeTarget.kind === "file") {
    let existing = null;
    let isJsonc = false;
    try {
      existing = JSON.parse(activeTarget.text);
    } catch {
      try {
        existing = parseJsonc(activeTarget.text);
        isJsonc = true;
      } catch {
        existing = null;
      }
    }
    if (existing === null || typeof existing !== "object") {
      files.push(blockedEntry(activePath, "invalid-json", `${path.basename(activePath)} is not valid JSON or JSONC. ${handMerge}`, true));
    } else {
      // A differing ziki entry is ours to update when the manifest proves we
      // wrote the file; anyone else's entry needs an explicit replace
      // approval, and the plan shows only that entry as a diff. Owned tool
      // denials follow the same rule: ours update, foreign need replace.
      const ours = typeof recorded[activePath] === "string";
      const filename = path.basename(activePath);
      const markJsonc = (entry) => {
        if (isJsonc) {
          entry.isJsonc = true;
          if (entry.reason !== "foreign") {
            entry.reason = "jsonc";
            entry.existingText = activeTarget.text;
          }
        }
      };
      let merged = null;
      try {
        merged = mergeOpencodeConfig(existing, { ziki: block }, tools, { filename });
      } catch {
        merged = null;
      }
      if (merged !== null) {
        markJsonc(pushFile(activePath, `${JSON.stringify(merged, null, 2)}\n`));
      } else if (ours) {
        const forced = mergeOpencodeConfig(existing, { ziki: block }, tools, { force: true, filename });
        markJsonc(pushFile(activePath, `${JSON.stringify(forced, null, 2)}\n`));
      } else {
        const forced = mergeOpencodeConfig(existing, { ziki: block }, tools, { force: true, filename });
        const entry = pushFile(activePath, `${JSON.stringify(forced, null, 2)}\n`);
        entry.reason = "foreign";
        entry.requiresReplace = true;
        const oldEntry = existing && typeof existing.mcp === "object" && existing.mcp !== null ? existing.mcp.ziki : undefined;
        entry.replaceOld = oldEntry === undefined ? "(absent)" : JSON.stringify(oldEntry, null, 2);
        entry.replaceNew = JSON.stringify(block, null, 2);
        markJsonc(entry);
      }
    }
  } else {
    files.push(blockedEntry(activePath, activeTarget.kind, `refusing to touch ${activeTarget.kind}; remove or replace it first`, true));
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
  const lines = [];
  for (const file of plan.files) {
    const reason = file.reason ? ` (${file.reason})` : "";
    const confirm = file.requiresConfirmation ? " [needs --confirm]" : "";
    const replace = file.requiresReplace === true ? " [needs --replace-ziki]" : "";
    lines.push(`${file.status}  ${file.path}${reason}${confirm}${replace}`);
    if (file.status === "blocked" && file.detail) {
      for (const detailLine of file.detail.split("\n")) {
        lines.push(`  ${detailLine}`);
      }
    }
    if (file.reason === "foreign" && typeof file.replaceOld === "string" && typeof file.replaceNew === "string") {
      // Only the ziki entry, never the whole file: the rest stays untouched.
      if (file.replaceOld !== file.replaceNew) {
        for (const diffLine of diffLines(file.replaceOld, file.replaceNew)) {
          lines.push(`  ${diffLine}`);
        }
      }
    }
    if (file.isJsonc === true) {
      lines.push("  warning: comments and formatting in this file will be removed; a backup is made before writing");
      if (file.reason !== "foreign" && typeof file.existingText === "string") {
        for (const diffLine of diffLines(file.existingText, file.desiredText)) {
          lines.push(`  ${diffLine}`);
        }
      }
    }
  }
  const needConfirm = plan.files.filter((f) => f.requiresConfirmation && f.status !== "unchanged");
  const needReplace = plan.files.some((f) => f.requiresReplace === true && f.status !== "unchanged");
  if (needConfirm.length > 0) {
    lines.push(`re-run with: --apply --yes${needReplace ? " --replace-ziki" : ""} ${needConfirm.map((f) => `--confirm "${f.path}"`).join(" ")}`);
  } else if (plan.files.some((f) => f.status !== "unchanged")) {
    lines.push("re-run with: --apply --yes");
  }
  return lines.join("\n");
}

export function applySetupPlan(plan, { confirm = [], yes = false, replaceZiki = false, io = realIo(), now = () => new Date() } = {}) {
  if (yes !== true) {
    throw new Error("refusing to write without approval; re-run with --apply --yes (plus --confirm <path> for existing files)");
  }
  const replaced = plan.files.filter((file) => file.requiresReplace === true && file.status !== "unchanged");
  if (replaced.length > 0 && replaceZiki !== true) {
    const flags = replaced.map((file) => `--confirm "${file.path}"`).join(" ");
    throw new Error(`refusing to replace the existing ziki entry without approval; re-run with --replace-ziki --apply --yes ${flags}`);
  }
  const confirmed = new Set(confirm);
  const changed = plan.files.filter((file) => file.status !== "unchanged");
  const missing = changed.filter((file) => file.requiresConfirmation && !confirmed.has(file.path));
  if (missing.length > 0) {
    const flags = missing.map((file) => `--confirm "${file.path}"`).join(" ");
    throw new Error(`refusing to overwrite without confirmation; re-run with ${flags}`);
  }
  const configEntry = changed.find((file) => (file.path.endsWith("opencode.json") || file.path.endsWith("opencode.jsonc")) && file.existingExists);
  if (configEntry) {
    const stamp = now().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(configEntry.absolutePath, `${configEntry.absolutePath}.ziki-backup-${stamp}`);
  }
  return applyPlan(plan, { confirm, io, replaceOwned: replaceZiki });
}

export async function cmdSetupOpencode({ apply = false, yes = false, confirm = [], replaceZiki = false, persona = "keep", server, mcpServer } = {}, { home = os.homedir(), root = packageRoot(), asker = defaultAsker(), out = defaultOut } = {}) {
  let serverUrl = server;
  if (!serverUrl) {
    let config;
    try {
      config = loadConfig(resolveConfigPath());
    } catch {
      return { code: 1, text: "not paired; run `ziki login` first (or pass --server)\n" };
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
  if (!apply && !asker) {
    return { code: 0, text: `${formatPlan(plan)}\n` };
  }
  let toConfirm = confirm;
  let toYes = yes;
  let toReplace = replaceZiki;
  if (!apply) {
    out(formatPlan(plan));
    const blocked = plan.files.filter((file) => file.status === "blocked");
    if (blocked.length > 0) {
      return { code: 1, text: `cannot apply with blocked entries (${blocked.map((f) => f.path).join(", ")}); see above, fix, then re-run.\n` };
    }
    if (!(await asker.confirm(planQuestion(plan)))) {
    return { code: 0, text: "not applied\n" };
    }
    if (plan.files.some((file) => file.requiresReplace === true && file.status !== "unchanged") && !(await asker.confirm(REPLACE_QUESTION))) {
      return { code: 0, text: "not applied\n" };
    }
    toConfirm = plan.files.map((file) => file.path);
    toYes = true;
    toReplace = true;
  }
  try {
    const written = applySetupPlan(plan, { confirm: toConfirm, yes: toYes, replaceZiki: toReplace });
    return { code: 0, text: `wrote ${written.length} file(s)\n` };
  } catch (error) {
    return { code: 1, text: `${error.message}\n` };
  }
}
