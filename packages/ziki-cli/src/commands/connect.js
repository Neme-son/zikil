import fs from "node:fs";
import path from "node:path";
import { apiFetch } from "../config/store.js";

function findProject(projects, selector) {
  return projects.find((p) => p.id === selector || p.slug === selector || p.name === selector) ?? null;
}

// Links the current directory to one Ziki project. The agent key is
// organisation-scoped, so this records (not grants) which project this
// checkout works on. Refuses to overwrite a different pointer without force.
export async function connectProject(config, selector, { cwd, fetchImpl, force }) {
  const res = await apiFetch(config, "/api/v1/agents/me", { fetchImpl });
  if (res.ok !== true) {
    throw new Error(`server answered ${res.status}`);
  }
  const me = await res.json();
  const found = findProject(me.projects ?? [], selector);
  if (!found) {
    const names = (me.projects ?? []).map((p) => p.slug ?? p.id).join(", ");
    throw new Error(`no project matching "${selector}" (available: ${names === "" ? "none" : names})`);
  }
  const pointer = {
    projectId: found.id,
    projectSlug: found.slug ?? null,
    org: me.org_slug ?? null,
    server: config.url,
  };
  const file = path.join(cwd, ".ziki.json");
  let existingText = null;
  try {
    existingText = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }
  if (existingText !== null) {
    let same = false;
    try {
      same = JSON.stringify(JSON.parse(existingText)) === JSON.stringify(pointer);
    } catch {
      same = false;
    }
    if (!same && !force) {
      throw new Error(".ziki.json already points elsewhere; re-run with --force to replace it");
    }
    if (same) {
      return pointer;
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(pointer, null, 2)}\n`);
  return pointer;
}
