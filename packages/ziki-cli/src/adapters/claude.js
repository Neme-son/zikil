import path from "node:path";
import { ZIKI_MCP_TOOL_DENYLIST } from "../allowlist.js";

// EXPERIMENTAL, not live-verified: no Claude binary was available to test
// against. Server attach goes through `claude mcp add` (run by hand, printed
// by the plan); restriction goes through permissions.deny in the user
// settings file, per the official Claude Code MCP docs.

export const CLAUDE_MCP_SERVER_NAME = "ziki";

export function CLAUDE_SETTINGS_PATH(home) {
  return path.join(home, ".claude", "settings.json");
}

// The pairing file already carries the server URL, so no --env is needed.
export function buildMcpAddCommand({ serverPath }) {
  return `claude mcp add --transport stdio --scope user ${CLAUDE_MCP_SERVER_NAME} -- node ${serverPath}`;
}

// shortcut: deny identifiers use the documented mcp__<server>__<tool> form;
// confirm against a live Claude before trusting the restriction.
export function claudeDenyId(mcpToolName) {
  return `mcp__${CLAUDE_MCP_SERVER_NAME}__${mcpToolName}`;
}

export function buildDenyRules() {
  return ZIKI_MCP_TOOL_DENYLIST.map(claudeDenyId);
}

// Additive merge into permissions.deny. Existing rules stay; ours append.
export function mergeSettingsDeny(existing, rules) {
  const out = { ...(existing ?? {}) };
  const permissions = { ...((existing && existing.permissions) || {}) };
  const deny = [...((permissions && permissions.deny) || [])];
  for (const rule of rules) {
    if (!deny.includes(rule)) {
      deny.push(rule);
    }
  }
  permissions.deny = deny;
  out.permissions = permissions;
  return out;
}
