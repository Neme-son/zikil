// Pure diagnostics: every input comes through `env` so tests inject fakes
// and the CLI injects the real filesystem and network.
export async function runDoctor(env) {
  const checks = [];
  checks.push({ name: "node", ok: true, detail: String(env.nodeVersion) });
  if (env.pairingFile.exists) {
    checks.push({ name: "pairing", ok: true, detail: env.pairingFile.path });
  } else {
    checks.push({ name: "pairing", ok: false, detail: "pairing file not found; run `ziki-cli login`" });
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
      detail: "no opencode config found; run `ziki-cli setup-opencode`",
    });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
