import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function assertLocalhost(server) {
  let host = "";
  try {
    host = new URL(server).hostname;
  } catch {
    throw new Error(`M1 allows localhost only: ${server}`);
  }
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error(`M1 allows localhost only: ${server}`);
  }
}

export function buildPairArgs({ server, name, open }) {
  const args = ["pair", "--url", server];
  if (name) {
    args.push("--name", name);
  }
  if (open === false) {
    args.push("--no-open");
  }
  return args;
}

// The reference client lives in this repo; pairing is reused by delegation,
// never reimplemented.
export function referenceClientPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "..", "scripts", "ziki-agent.mjs");
}

export function cmdLogin({ server = "http://localhost:3001", name, open } = {}) {
  assertLocalhost(server);
  const args = buildPairArgs({ server, name, open });
  const res = spawnSync(process.execPath, [referenceClientPath(), ...args], { stdio: "inherit" });
  return { code: res.status ?? 1, text: "" };
}
