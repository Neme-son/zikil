import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle, bundleSane, bundleSize, removeBundle } from "./bundle-mcp.mjs";

// Bundling is on by default. ZIKI_BUNDLE_MCP=0 packs without the MCP server
// (removing any stale bundle first); that install finds its server through
// --mcp-path, ZIKI_MCP_PATH, or a ziki checkout instead.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (process.env.ZIKI_BUNDLE_MCP === "0") {
  removeBundle(root);
  console.log("ZIKI_BUNDLE_MCP=0: packing without the MCP server bundle");
} else {
  buildBundle(root);
  if (!bundleSane(root)) {
    console.error(`MCP server bundle too small (${bundleSize(root)} bytes); refusing to pack`);
    process.exit(1);
  }
}
