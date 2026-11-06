import path from "node:path";

// Adapter slice 1: install paths, MCP server block, config merge.
// The permission (tool-restriction) block lands after live verification
// pins the exact per-tool key format (M1 verify-first order).

export function OPENCODE_GLOBAL_DIR(home) {
  return path.join(home, ".config", "opencode");
}

export function buildMcpBlock({ serverPath, serverUrl }) {
  return {
    ziki: {
      type: "local",
      command: ["node", serverPath],
      environment: { ZIKI_URL: serverUrl },
      enabled: true,
    },
  };
}

// Publish-proof resolution: explicit flag wins, then env, then the sibling
// checkout (packages/mcp-server). Works pre-publish (contributor checkout)
// and post-publish (bundled path passed explicitly) with no code change.
export function resolveMcpServerPath({ flag, env, cliRoot }) {
  if (flag) {
    return flag;
  }
  if (env.ZIKI_MCP_SERVER) {
    return env.ZIKI_MCP_SERVER;
  }
  return path.join(cliRoot, "..", "mcp-server", "dist", "index.js");
}

// Merges ONLY strict-JSON configs. JSONC or unparseable files are refused by
// the caller (blocked status), never silently rewritten.
export function mergeOpencodeConfig(existing, desiredMcp) {
  const out = { ...(existing ?? {}) };
  const mcp = { ...((existing && existing.mcp) || {}) };
  for (const [name, block] of Object.entries(desiredMcp)) {
    if (mcp[name] !== undefined && JSON.stringify(mcp[name]) !== JSON.stringify(block)) {
      throw new Error(`opencode.json already configures MCP server "${name}" differently; remove or update it by hand first`);
    }
    mcp[name] = block;
  }
  out.mcp = mcp;
  return out;
}
