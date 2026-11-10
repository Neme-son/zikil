export { ZIKI_MCP_TOOL_DENYLIST as DENIED_MCP_TOOLS } from "../allowlist.js";
import { ZIKI_MCP_TOOL_DENYLIST } from "../allowlist.js";
import path from "node:path";

// Adapter slice 1: install paths, MCP server block, config merge.
// Slice 2: tool restriction. OpenCode registers MCP tools as
// `<server>_<tool>` and disables them through a top-level `tools` map of
// name/glob to false (verified live against opencode 2.1.3: the map parses
// and the MCP server connects over stdio). M1 denies every submission tool
// by exact exposed name, plus a `ziki_*` backstop so tools added upstream
// later default to denied rather than enabled.

export const OPENCODE_MCP_SERVER_NAME = "ziki";

export const ZIKI_TOOL_DENY_GLOB = "ziki_*";

export function OPENCODE_GLOBAL_DIR(home) {
  return path.join(home, ".config", "opencode");
}

export function exposedToolName(mcpToolName) {
  return `${OPENCODE_MCP_SERVER_NAME}_${mcpToolName}`;
}

export function buildMcpBlock({ serverPath, serverUrl }) {
  return {
    [OPENCODE_MCP_SERVER_NAME]: {
      type: "local",
      command: ["node", serverPath],
      environment: { ZIKI_URL: serverUrl },
      enabled: true,
    },
  };
}

export function buildToolsMap() {
  const tools = { [ZIKI_TOOL_DENY_GLOB]: false };
  for (const tool of ZIKI_MCP_TOOL_DENYLIST) {
    tools[exposedToolName(tool)] = false;
  }
  return tools;
}

// Merges ONLY strict-JSON configs. JSONC or unparseable files are refused by
// the caller (blocked status), never silently rewritten. By default a
// differing entry throws for the human; `force` overwrites entries we own
// (the manifest proves we wrote the file) or that the human approved.
export function mergeOpencodeConfig(existing, desiredMcp, desiredTools, { force = false, filename = "opencode.json" } = {}) {
  const out = { ...(existing ?? {}) };
  const mcp = { ...((existing && existing.mcp) || {}) };
  for (const [name, block] of Object.entries(desiredMcp)) {
    if (mcp[name] !== undefined && JSON.stringify(mcp[name]) !== JSON.stringify(block) && !force) {
      throw new Error(`${filename} already configures MCP server "${name}" differently; remove or update it by hand first`);
    }
    mcp[name] = block;
  }
  out.mcp = mcp;
  if (desiredTools) {
    out.tools = mergeToolsMap((existing && existing.tools) || {}, desiredTools, { force, filename });
  }
  return out;
}

// Adds our denials to the user's tools map. Anything already false stays;
// anything enabled that we deny is a conflict for the human, never a silent
// flip: they may have enabled it on purpose. `force` overwrites owned
// entries the same way the MCP block above does.
export function mergeToolsMap(existingTools, desiredTools, { force = false, filename = "opencode.json" } = {}) {
  const tools = { ...(existingTools ?? {}) };
  for (const [name, value] of Object.entries(desiredTools)) {
    if (tools[name] !== undefined && tools[name] !== value && !force) {
      throw new Error(`${filename} already sets tool "${name}" differently; remove or update it by hand first`);
    }
    tools[name] = value;
  }
  return tools;
}
