// Pure diagnostics: every input comes through `env` so tests inject fakes
// and the CLI injects the real filesystem and network.
import { PROGRAM_NAME } from "../program.js";
import { MCP_BUILD_COMMAND } from "../mcp.js";

export async function runDoctor(env) {
  const checks = [];
  checks.push({ name: "node", ok: true, detail: String(env.nodeVersion) });
  if (env.pairingFile.exists) {
    checks.push({ name: "pairing", ok: true, detail: env.pairingFile.path });
  } else {
    checks.push({ name: "pairing", ok: false, detail: "pairing file not found; run `" + PROGRAM_NAME + " login`" });
  }
  try {
    const res = await env.fetchImpl(`${env.serverUrl}/api/health`);
    checks.push({
      name: "server",
      ok: res.ok === true,
      detail: res.ok === true ? `${env.serverUrl} reachable` : `${env.serverUrl} answered ${res.status}`,
    });
  } catch (error) {
    checks.push({ name: "server", ok: false, detail: `unreachable: ${error.message || error}` });
  }
  if (env.opencodeConfig.exists) {
    checks.push({ name: "opencode", ok: true, detail: env.opencodeConfig.path });
  } else {
    checks.push({
      name: "opencode",
      ok: true,
      warning: true,
      detail: "no opencode config found; run `" + PROGRAM_NAME + " setup-opencode`",
    });
  }
  if (env.mcpServer) {
    checks.push({ name: "mcp-server", ok: true, detail: `${env.mcpServer.source}: ${env.mcpServer.path}` });
  } else {
    checks.push({
      name: "mcp-server",
      ok: false,
      detail: `not found; from a ziki checkout run \`${MCP_BUILD_COMMAND}\`, or pass --mcp-path <file>`,
    });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
