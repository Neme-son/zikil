import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PROGRAM_NAME } from "../program.js";

export class ConfigError extends Error {}

// Same resolution as scripts/ziki-agent.mjs: explicit override wins,
// otherwise the shared reference-client store.
export function resolveConfigPath(env = process.env) {
  if (env.ZIKI_AGENT_CONFIG) {
    return env.ZIKI_AGENT_CONFIG;
  }
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "ziki", "agent.json");
}

export function loadConfig(configPath) {
  let text;
  try {
    text = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new ConfigError(`pairing file not found: ${configPath} (run \`${PROGRAM_NAME} login\` first)`);
    }
    throw new ConfigError(`cannot read pairing file: ${configPath}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ConfigError(`pairing file is not valid JSON: ${configPath}`);
  }
}

// Everything about the config that may ever reach output. The key stays out.
export function summarizeConfig(config) {
  return { url: config.url ?? null, hasKey: Boolean(config.apiKey) };
}

export async function apiFetch(config, apiPath, { method = "GET", body, fetchImpl = globalThis.fetch } = {}) {
  const headers = { Authorization: `Bearer ${config.apiKey}` };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return fetchImpl(config.url + apiPath, init);
}
