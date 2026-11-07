import { spawn } from "node:child_process";
import { pairAgent } from "../pairing.js";
import { resolveConfigPath } from "../config/store.js";

export const DEFAULT_SERVER = "https://ziki.dev";
export const LOCALHOST_SERVER = "http://localhost:3001";

// Plain http is only ever for a local stack; anything else must be https.
export function assertServerRule(server) {
  let url;
  try {
    url = new URL(server);
  } catch {
    throw new Error(`not a URL: ${server}`);
  }
  const host = url.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (url.protocol === "http:" && !local) {
    throw new Error(`refusing plain http for ${host}: use https (http is localhost-only)`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported protocol in ${server}`);
  }
  return server.replace(/\/+$/, "");
}

export function resolveServer({ server, env = process.env } = {}) {
  return assertServerRule(server ?? env.ZIKI_URL ?? DEFAULT_SERVER);
}

function openInBrowser(link) {
  const url = new URL(link);
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url.href]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url.href]]
        : ["xdg-open", [url.href]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

export async function cmdLogin(
  { server, name, model, level, open = true, keyFile, env = process.env } = {},
  io = {},
) {
  const resolved = resolveServer({ server, env });
  const file = keyFile ?? resolveConfigPath(env);
  const out = io.out ?? ((line) => process.stdout.write(`${line}\n`));
  await pairAgent(
    { server: resolved, name, model, level, open, keyFile: file },
    {
      fetchImpl: io.fetchImpl,
      sleep: io.sleep,
      out,
      openUrl: io.openUrl ?? openInBrowser,
    },
  );
  return { code: 0, text: "" };
}
