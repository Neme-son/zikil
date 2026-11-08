import os from "node:os";
import { LOCALHOST_SERVER, assertServerRule, cmdLogin } from "./login.js";
import { connectProject } from "./connect.js";
import { cmdSetupOpencode, packageRoot } from "./setup-opencode.js";
import { readPointer } from "./work.js";
import { resolveConfigPath, loadConfig, summarizeConfig, apiFetch } from "../config/store.js";
import { defaultAsker, defaultOut } from "../setup/ask.js";

// One name for every message here, so a rename touches one line.
const CMD = "ziki-cli";

// Guided first-time setup: login, connect, setup-opencode. Each step says
// what it will do first; a no (or a failure) stops cleanly with the exact
// step to re-run. Progress streams through `out` (login polls for minutes);
// the returned text stays empty like cmdLogin.
export async function cmdInit(
  { server } = {},
  {
    env = process.env,
    cwd = process.cwd(),
    home = os.homedir(),
    root = packageRoot(),
    asker = defaultAsker(),
    out = defaultOut,
    fetchImpl = globalThis.fetch,
    doLogin = cmdLogin,
    doConnect = connectProject,
    doSetup = cmdSetupOpencode,
  } = {},
) {
  let serverUrl;
  try {
    serverUrl = assertServerRule(server ?? LOCALHOST_SERVER);
  } catch (error) {
    return { code: 1, text: `${error.message}\n` };
  }
  const stop = (message) => {
    out(message);
    return { code: 0, text: "" };
  };
  const fail = (message) => {
    out(message);
    return { code: 1, text: "" };
  };

  out(`${CMD} init — guided setup (server: ${serverUrl})`);

  // Step 1: login.
  const keyFile = resolveConfigPath(env);
  let config = null;
  try {
    const loaded = loadConfig(keyFile);
    if (summarizeConfig(loaded).hasKey) {
      config = loaded;
    }
  } catch {
    config = null;
  }
  if (config) {
    out(`Step 1/3: login — already paired (${summarizeConfig(config).url ?? "unknown server"}); skipping.`);
  } else {
    out(`Step 1/3: login — pair this machine with ${serverUrl} (a browser opens for the device code).`);
    if (asker && !(await asker.confirm("Continue? [y/N] "))) {
      return stop(`login skipped; re-run \`${CMD} init\` or \`${CMD} login --server ${serverUrl}\`.`);
    }
    try {
      await doLogin({ server: serverUrl, keyFile, env, open: true }, { out, fetchImpl });
    } catch (error) {
      return fail(`login failed: ${error.message}; re-run \`${CMD} init\` or \`${CMD} login --server ${serverUrl}\`.`);
    }
    try {
      config = loadConfig(keyFile);
    } catch {
      return fail(`login finished but the pairing file is unreadable; re-run \`${CMD} login --server ${serverUrl}\`.`);
    }
  }

  // Step 2: connect.
  out(`Step 2/3: connect — link ${cwd} to a Ziki project.`);
  let meRes;
  try {
    meRes = await apiFetch(config, "/api/v1/agents/me", { fetchImpl });
  } catch (error) {
    return fail(`connect failed: server unreachable (${error.message || error}); re-run \`${CMD} init\`.`);
  }
  if (meRes.ok !== true) {
    return fail(`connect failed: server answered ${meRes.status}; the pairing may be stale, re-run \`${CMD} login --server ${serverUrl}\`.`);
  }
  const projects = (await meRes.json()).projects ?? [];
  const pointer = readPointer(cwd);
  const linked = pointer && projects.some((p) => p.id === pointer.projectId || (pointer.projectSlug != null && p.slug === pointer.projectSlug));
  if (pointer && linked) {
    out(`Already linked to ${pointer.projectSlug ?? pointer.projectId}; skipping.`);
  } else {
    if (projects.length === 0) {
      return fail(`connect failed: this key has no projects; re-run \`${CMD} init\` after joining one.`);
    }
    let selector;
    if (projects.length === 1) {
      selector = projects[0].slug ?? projects[0].id;
      out(`One project on this key: ${projects[0].name ?? selector}.`);
    } else {
      if (!asker) {
        return stop(`more than one project and no terminal to choose; run \`${CMD} connect --project <slug-or-id>\`, then re-run \`${CMD} init\`.`);
      }
      out("Projects on this key:");
      projects.forEach((p, i) => out(`  ${i + 1}) ${p.name ?? p.slug ?? p.id} (${p.slug ?? p.id})`));
      const answer = ((await asker.input("Which project? [number or slug] ")) ?? "").trim();
      const byNumber = /^\d+$/.test(answer) ? projects[Number(answer) - 1] ?? null : null;
      const found = byNumber ?? projects.find((p) => p.slug === answer || p.id === answer || p.name === answer) ?? null;
      if (!found) {
        return stop(`no project matching "${answer}"; re-run \`${CMD} init\` or \`${CMD} connect --project <slug-or-id>\`.`);
      }
      selector = found.slug ?? found.id;
    }
    if (pointer && !linked) {
      return stop(`.ziki.json already points to ${pointer.projectSlug ?? pointer.projectId}; remove it or run \`${CMD} connect --project ${selector} --force\`, then re-run \`${CMD} init\`.`);
    }
    if (asker && !(await asker.confirm(`Link this checkout to ${selector}? [y/N] `))) {
      return stop(`connect skipped; re-run \`${CMD} init\` or \`${CMD} connect --project ${selector}\`.`);
    }
    try {
      const next = await doConnect(config, selector, { cwd, fetchImpl, force: false });
      out(`Linked to ${next.projectSlug ?? next.projectId}.`);
    } catch (error) {
      return fail(`connect failed: ${error.message}; re-run \`${CMD} init\`.`);
    }
  }

  // Step 3: setup.
  out("Step 3/3: setup-opencode — install the OpenCode adapter (shows a plan first).");
  let setupResult;
  try {
    setupResult = await doSetup({ server: serverUrl }, { home, root, asker, out });
  } catch (error) {
    return fail(`setup-opencode failed: ${error.message}; re-run \`${CMD} init\` or \`${CMD} setup-opencode\`.`);
  }
  if (setupResult.code !== 0) {
    return fail(`setup-opencode failed: ${setupResult.text.trim()}; re-run \`${CMD} init\` or \`${CMD} setup-opencode\`.`);
  }
  if (setupResult.text !== "") {
    out(setupResult.text.replace(/\n$/, ""));
  }
  if (!asker) {
    out(`plan only (no terminal); apply with the re-run command above, or re-run \`${CMD} init\` on a terminal.`);
  } else if (setupResult.text === "not applied\n") {
    out(`setup skipped; re-run \`${CMD} init\` to continue.`);
  } else {
    out("init done.");
  }
  return { code: 0, text: "" };
}
