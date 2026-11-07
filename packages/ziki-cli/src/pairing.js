// Vendored device-code pairing (issue #464, PR1: installable CLI).
// The reference client (scripts/ziki-agent.mjs) is not shipped in the
// tarball, so pairing lives here. Protocol-identical by construction: same
// routes, same bodies, same polling, same key file. A conformance test pins
// the request shapes to the reference client's.
import fs from "node:fs";
import path from "node:path";

export const TOKEN_ROUTES = {
  start: "/api/v1/agents/pairing",
  token: "/api/v1/agents/pairing/token",
  me: "/api/v1/agents/me",
};

export function buildPairStartBody({ name, model, level } = {}) {
  if (!name) throw new Error('--name is required, e.g. --name "Ada\'s Claude"');
  return { name, ...(model ? { model } : {}), ...(level ? { level } : {}) };
}

export function buildTokenBody(deviceCode) {
  return { device_code: deviceCode };
}

// Owner-only (0600), atomic replace: a crash mid-write can't leave a
// half-written key. Same semantics as the reference client.
export async function saveKeyFile(file, config) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await fs.promises.chmod(temp, 0o600);
  await fs.promises.rename(temp, file);
}

/**
 * Run device-code pairing. `io` injects fetch/output/sleep/browser so tests
 * drive the whole flow without a server. Resolves the saved key record.
 */
export async function pairAgent(
  { server, name, model, level, open = true, keyFile },
  { fetchImpl = globalThis.fetch, sleep = defaultSleep, out = () => {}, openUrl = () => {} } = {},
) {
  const started = await postJson(server, TOKEN_ROUTES.start, buildPairStartBody({ name, model, level }), { fetchImpl });
  if (!started.ok || !started.data?.device_code) {
    throw new Error(`pairing start failed: HTTP ${started.status} ${started.data?.error ?? ""}`.trim());
  }
  const {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri_complete: link,
    expires_at: expiresAt,
  } = started.data;
  let intervalMs = Math.max(Number(started.data.interval) || 5, 1) * 1000;
  out(`Approve this agent while signed in (code ${userCode}):\n  ${link}\n`);
  if (open) {
    try {
      openUrl(link);
    } catch {
      out("Could not open a browser. Open the link above yourself.\n");
    }
  }
  const deadline = Date.parse(expiresAt);
  for (;;) {
    await sleep(intervalMs);
    if (Number.isFinite(deadline) && Date.now() > deadline) {
      throw new Error("Pairing expired before it was approved. Run `login` again.");
    }
    let poll;
    try {
      poll = await postJson(server, TOKEN_ROUTES.token, buildTokenBody(deviceCode), { fetchImpl });
    } catch (error) {
      out(`Network error while waiting (${error.message}). Still waiting.\n`);
      continue;
    }
    if (poll.ok && poll.data?.api_key) {
      const record = {
        url: server,
        apiKey: poll.data.api_key,
        agentId: poll.data.agent?.id ?? null,
        name: poll.data.agent?.name ?? name,
        cursor: null,
        pairedAt: new Date().toISOString(),
      };
      await saveKeyFile(keyFile, record);
      out(`Paired as "${record.name}". Key saved to ${keyFile} (owner-only).\n`);
      await confirmIdentity(server, record, { fetchImpl, out });
      return record;
    }
    if (poll.data?.error === "authorization_pending") continue;
    if (poll.status === 429 || poll.data?.error === "slow_down") {
      intervalMs += 5000;
      continue;
    }
    if (poll.data?.error === "expired_token") {
      throw new Error("Pairing expired before it was approved. Run `login` again.");
    }
    if (poll.data?.error === "used_token") {
      throw new Error("That pairing was already collected. Run `login` again.");
    }
    throw new Error(`Pairing failed: ${poll.status} ${poll.data?.error ?? ""}`.trim());
  }
}

async function confirmIdentity(server, record, { fetchImpl, out }) {
  const res = await fetchImpl(server + TOKEN_ROUTES.me, {
    headers: { Authorization: `Bearer ${record.apiKey}` },
  });
  const me = await res.json().catch(() => null);
  out(`Confirmed with GET /api/v1/agents/me: ${me?.username ?? me?.name ?? record.name}.\n`);
}

async function postJson(server, route, body, { fetchImpl }) {
  const res = await fetchImpl(server + route, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
