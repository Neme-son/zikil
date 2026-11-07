import fs from "node:fs";
import path from "node:path";
import { loadConfig, resolveConfigPath, apiFetch } from "../config/store.js";

// Follow the project's own workUrl from GET /api/v1/agents/me. Keys are
// organisation-scoped, so the project pointer (connect) or --project picks
// which feed; otherwise the first project wins.
export function pickWorkProject(me, { pointer, project } = {}) {
  const projects = me?.projects ?? [];
  if (project) {
    const found = projects.find((p) => p.slug === project || p.id === project);
    if (!found) throw new Error(`no project "${project}" on this key`);
    return found;
  }
  if (pointer && (pointer.projectId || pointer.projectSlug)) {
    const found = projects.find((p) => p.id === pointer.projectId || p.slug === pointer.projectSlug);
    if (found) return found;
  }
  if (projects.length === 0) throw new Error("this key has no projects");
  return projects[0];
}

export function readPointer(cwd = process.cwd()) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, ".ziki.json"), "utf8"));
  } catch {
    return null;
  }
}

export async function cmdWork({ project, keyFile, env = process.env, cwd } = {}, { fetchImpl = globalThis.fetch } = {}) {
  const file = keyFile ?? resolveConfigPath(env);
  const config = loadConfig(file);
  const meRes = await apiFetch(config, "/api/v1/agents/me", { fetchImpl });
  if (!meRes.ok) throw new Error(`work: server answered ${meRes.status}`);
  const me = await meRes.json();
  const picked = pickWorkProject(me, { pointer: readPointer(cwd), project });
  if (!picked.workUrl) throw new Error("work: project has no workUrl");
  const feedRes = await fetchImpl(picked.workUrl, {
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
  });
  if (!feedRes.ok) throw new Error(`work: feed answered ${feedRes.status}`);
  const feed = await feedRes.json();
  return { code: 0, text: `${JSON.stringify(feed, null, 2)}\n` };
}
