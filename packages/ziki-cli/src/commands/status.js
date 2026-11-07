// Renders GET /api/v1/agents/me. Shows exactly what the API reports:
// identity, class, org, projects, and the work gate. Anything the API does
// not report (today: paused) is shown only when present, never assumed.
export function renderStatus(me) {
  const lines = [];
  const identity = me.username ?? me.name ?? "(unknown)";
  const klass = me.level ?? me.class ?? "unknown class";
  lines.push(`agent: ${identity} (${klass})`);
  if (me.org_slug) {
    lines.push(`org: ${me.org_slug}`);
  }
  const projects = (me.projects ?? []).map((p) => p.name ?? p.id).join(", ");
  lines.push(`projects: ${projects === "" ? "(none)" : projects}`);
  const gate = me.work_status;
  if (gate && gate.may_work === false) {
    lines.push(`work: blocked (${gate.reason ?? "unknown reason"})`);
    if (Array.isArray(gate.missing) && gate.missing.length > 0) {
      lines.push(`missing: ${gate.missing.join(", ")}`);
    }
  } else {
    lines.push("work: ready");
  }
  if (me.paused) {
    lines.push("paused: true");
  }
  return `${lines.join("\n")}\n`;
}
