import fs from "node:fs";
import path from "node:path";

// Shared, harness-neutral MCP server resolution. Order: explicit --mcp-path,
// ZIKI_MCP_PATH, the vendored bundle shipped in the tarball (prepack builds
// it unless ZIKI_BUNDLE_MCP=0), then a ziki checkout above the working
// directory. Returns { path, source } or null when nothing is found.
export const MCP_BUILD_COMMAND = "pnpm --dir packages/mcp-server build";

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function findCheckoutServer(cwd) {
  let dir = cwd;
  for (;;) {
    const candidate = path.join(dir, "packages", "mcp-server", "dist", "index.js");
    if (isFile(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function resolveMcpServer({ mcpPath, env, cliRoot, cwd }) {
  if (mcpPath) {
    return { path: mcpPath, source: "--mcp-path" };
  }
  if (env.ZIKI_MCP_PATH) {
    return { path: env.ZIKI_MCP_PATH, source: "ZIKI_MCP_PATH" };
  }
  const vendor = path.join(cliRoot, "vendor", "mcp-server.cjs");
  if (isFile(vendor)) {
    return { path: vendor, source: "bundled" };
  }
  const checkout = findCheckoutServer(cwd);
  if (checkout) {
    return { path: checkout, source: "checkout" };
  }
  return null;
}
