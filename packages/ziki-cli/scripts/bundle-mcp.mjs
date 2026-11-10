import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Shared bundle helpers for prepack/prepublish: where the MCP server bundle
// lives, how to build it, and what counts as a real one. The real bundle is
// hundreds of KB; anything under 10 KB is empty or truncated.
export const MIN_BUNDLE_BYTES = 10 * 1024;

export function bundlePath(root) {
  return path.join(root, "vendor", "mcp-server.cjs");
}

export function bundleSize(root) {
  try {
    return fs.statSync(bundlePath(root)).size;
  } catch {
    return -1;
  }
}

export function bundleSane(root) {
  return bundleSize(root) >= MIN_BUNDLE_BYTES;
}

export function removeBundle(root) {
  fs.rmSync(path.join(root, "vendor"), { recursive: true, force: true });
}

export function buildCommand(root) {
  return `npx -y esbuild@0.28.2 ../mcp-server/src/index.ts --bundle --platform=node --format=cjs --outfile="${bundlePath(root)}" --log-level=warning`;
}

export function buildBundle(root) {
  execSync(buildCommand(root), { stdio: "inherit", cwd: root });
}
