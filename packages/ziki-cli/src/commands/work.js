import { spawnSync } from "node:child_process";
import { referenceClientPath } from "./login.js";

export function buildWorkArgs({ project } = {}) {
  if (project) {
    throw new Error("--project is not supported in M1: the reference explicit-project URL predates org routes; keys are project-scoped so the default feed is already yours");
  }
  return ["work"];
}

// Delegates to the reference client, whose default path follows the
// server-provided org-aware work_url. No --project passthrough in M1.
export function cmdWork() {
  const res = spawnSync(process.execPath, [referenceClientPath(), ...buildWorkArgs({})], {
    stdio: "inherit",
  });
  return { code: res.status ?? 1, text: "" };
}
