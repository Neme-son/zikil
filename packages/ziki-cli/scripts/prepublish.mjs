import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleSane, bundleSize } from "./bundle-mcp.mjs";

// Guard rail: a publish can't produce an empty package. Runs before prepack,
// so on a fresh checkout the bundle isn't built yet — the error says so.
// Skipped for bundle-less (ZIKI_BUNDLE_MCP=0) publishes.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (process.env.ZIKI_BUNDLE_MCP === "0") {
  console.log("ZIKI_BUNDLE_MCP=0: publishing without the MCP server bundle");
} else if (!bundleSane(root)) {
  const size = bundleSize(root);
  console.error(`MCP server bundle ${size < 0 ? "missing" : `too small (${size} bytes)`}; run \`npm run prepack\` first`);
  process.exit(1);
}
