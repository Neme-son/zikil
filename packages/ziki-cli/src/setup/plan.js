import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Harness-neutral plan/apply core, adapted from the prototype mechanics:
// classify every target, show the plan, write only with approval, refuse to
// overwrite anything unconfirmed. File IO goes through `io` so tests inject
// fakes and commands inject the real thing.

export function digest(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function classifyFile(existing, desiredText, recordedHash = null) {
  if (existing.kind === "absent") {
    return { status: "create", reason: null, requiresConfirmation: false };
  }
  if (existing.kind === "file" && existing.text === desiredText) {
    return { status: "unchanged", reason: null, requiresConfirmation: false };
  }
  if (existing.kind === "file") {
    if (typeof recordedHash === "string") {
      const want = recordedHash.startsWith("sha256:") ? recordedHash.slice("sha256:".length) : recordedHash;
      const reason = digest(existing.text) === want ? "generated" : "modified-since-recorded";
      return { status: "update", reason, requiresConfirmation: true };
    }
    return { status: "update", reason: "unverified", requiresConfirmation: true };
  }
  return { status: "replace", reason: existing.kind, requiresConfirmation: true };
}

export function realIo() {
  return {
    readTarget(absolutePath) {
      let stat;
      try {
        stat = fs.lstatSync(absolutePath);
      } catch (error) {
        return error && error.code === "ENOENT" ? { kind: "absent" } : { kind: "read-error" };
      }
      if (stat.isSymbolicLink()) {
        return { kind: "symlink" };
      }
      if (!stat.isFile()) {
        return { kind: "not-file" };
      }
      try {
        return { kind: "file", text: fs.readFileSync(absolutePath, "utf8") };
      } catch {
        return { kind: "read-error" };
      }
    },
    writeFile(absolutePath, text) {
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      const tmp = `${absolutePath}.ziki-tmp-${process.pid}`;
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, absolutePath);
    },
  };
}

export function applyPlan(plan, { confirm = [], io, replaceOwned = false }) {
  const blocked = plan.files.filter((file) => file.status === "blocked");
  if (blocked.length > 0) {
    throw new Error(`refusing to apply: blocked entries present (${blocked.map((f) => f.path).join(", ")})`);
  }
  const replaced = plan.files.filter((file) => file.requiresReplace === true && file.status !== "unchanged");
  if (replaced.length > 0 && replaceOwned !== true) {
    throw new Error(`refusing to replace without replace approval (${replaced.map((f) => f.path).join(", ")})`);
  }
  const confirmed = new Set(confirm);
  const changed = plan.files.filter((file) => file.status !== "unchanged");
  const missing = changed.filter((file) => file.requiresConfirmation && !confirmed.has(file.path));
  if (missing.length > 0) {
    const flags = missing.map((file) => `--confirm ${file.path}`).join(" ");
    throw new Error(`refusing to overwrite without confirmation; re-run with ${flags}`);
  }
  const written = [];
  for (const file of changed) {
    io.writeFile(file.absolutePath, file.desiredText);
    written.push(file.path);
  }
  return written;
}
