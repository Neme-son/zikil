import fs from "node:fs";
import path from "node:path";

// Adapter slice 1: install paths, MCP server block, config merge.
// Slice 2: tool restriction. OpenCode registers MCP tools as
// `<server>_<tool>` and disables them through a top-level `tools` map of
// name/glob to false (verified live against opencode 2.1.3: the map parses
// and the MCP server connects over stdio). M1 denies every submission tool
// by exact exposed name, plus a `ziki_*` backstop so tools added upstream
// later default to denied rather than enabled.

export const OPENCODE_MCP_SERVER_NAME = "ziki";

// Every MCP tool outside the M1 allowlist, by MCP wire name: the audited
// complement of the 16 allowlisted tools within the 112-tool catalogue
// (packages/mcp-server/src/tools.ts). Regenerate against tools.ts when the
// catalogue changes; the backstop below covers anything missed.
export const DENIED_MCP_TOOLS = [
  "ziki_accept_job_review",
  "ziki_accept_offer",
  "ziki_accept_review_offer",
  "ziki_add_preference",
  "ziki_archive_idea",
  "ziki_ask_owner",
  "ziki_award_bid",
  "ziki_bid",
  "ziki_close_issue",
  "ziki_collect_pairing_token",
  "ziki_comment",
  "ziki_confirm_issue",
  "ziki_convert_idea",
  "ziki_cover_mission",
  "ziki_create_goal",
  "ziki_create_idea",
  "ziki_create_job",
  "ziki_create_marketing_task_type",
  "ziki_create_webhook",
  "ziki_delete_marketing_task_type",
  "ziki_delete_preference",
  "ziki_delete_webhook",
  "ziki_deliver",
  "ziki_escalate",
  "ziki_estimate_reward",
  "ziki_extend_deadline",
  "ziki_get_agent",
  "ziki_get_escalation",
  "ziki_get_goal",
  "ziki_get_history",
  "ziki_get_job",
  "ziki_get_points",
  "ziki_get_question",
  "ziki_get_reward",
  "ziki_give_idea_verdict",
  "ziki_heartbeat",
  "ziki_list_agents",
  "ziki_list_goal_allocations",
  "ziki_list_goals",
  "ziki_list_jobs",
  "ziki_list_marketing_task_types",
  "ziki_list_preferences",
  "ziki_list_projects",
  "ziki_list_skill_tags",
  "ziki_list_stakes",
  "ziki_list_webhook_deliveries",
  "ziki_list_webhooks",
  "ziki_mark_inbox_read",
  "ziki_merge_fix",
  "ziki_next_mission",
  "ziki_open_issue",
  "ziki_pair",
  "ziki_penalise_confirmation",
  "ziki_poll_events",
  "ziki_propose_redesign",
  "ziki_read_feed",
  "ziki_read_inbox",
  "ziki_reclaim_issue",
  "ziki_record_project_mistake",
  "ziki_refresh_stake",
  "ziki_reject_idea",
  "ziki_release_claim",
  "ziki_remove_picture",
  "ziki_remove_skill",
  "ziki_reopen_issue",
  "ziki_repair_pull_request",
  "ziki_report_deployment",
  "ziki_report_pr_status",
  "ziki_retry_webhook_delivery",
  "ziki_review_job_submission",
  "ziki_rotate_key",
  "ziki_set_picture",
  "ziki_set_skill",
  "ziki_set_skills",
  "ziki_split_goal",
  "ziki_stake_idea",
  "ziki_stake_issue",
  "ziki_structure_issue",
  "ziki_submit_job",
  "ziki_submit_test_result",
  "ziki_suggest_close",
  "ziki_triage",
  "ziki_update_goal",
  "ziki_update_marketing_task_type",
  "ziki_update_preference",
  "ziki_update_profile",
  "ziki_update_webhook",
  "ziki_upload_attachment",
  "ziki_upvote_comment",
  "ziki_vote_abandoned",
  "ziki_vote_bid",
  "ziki_vote_stake",
  "ziki_withdraw_bid",
  "ziki_withdraw_idea",
  "ziki_withdraw_issue",
  "ziki_withdraw_stake",
];

export const ZIKI_TOOL_DENY_GLOB = "ziki_*";

export function OPENCODE_GLOBAL_DIR(home) {
  return path.join(home, ".config", "opencode");
}

export function exposedToolName(mcpToolName) {
  return `${OPENCODE_MCP_SERVER_NAME}_${mcpToolName}`;
}

export function buildMcpBlock({ serverPath, serverUrl }) {
  return {
    [OPENCODE_MCP_SERVER_NAME]: {
      type: "local",
      command: ["node", serverPath],
      environment: { ZIKI_URL: serverUrl },
      enabled: true,
    },
  };
}

export function buildToolsMap() {
  const tools = { [ZIKI_TOOL_DENY_GLOB]: false };
  for (const tool of DENIED_MCP_TOOLS) {
    tools[exposedToolName(tool)] = false;
  }
  return tools;
}

// Install-proof resolution: explicit flag wins, then env, then the vendored
// bundle shipped in the tarball (prepack builds it), then the sibling
// checkout for contributors running from source.
export function resolveMcpServerPath({ flag, env, cliRoot }) {
  if (flag) {
    return flag;
  }
  if (env.ZIKI_MCP_SERVER) {
    return env.ZIKI_MCP_SERVER;
  }
  const vendor = path.join(cliRoot, "vendor", "mcp-server.cjs");
  try {
    if (fs.statSync(vendor).isFile()) {
      return vendor;
    }
  } catch {
    // fall through to the checkout layout
  }
  return path.join(cliRoot, "..", "mcp-server", "dist", "index.js");
}

// Merges ONLY strict-JSON configs. JSONC or unparseable files are refused by
// the caller (blocked status), never silently rewritten.
export function mergeOpencodeConfig(existing, desiredMcp, desiredTools) {
  const out = { ...(existing ?? {}) };
  const mcp = { ...((existing && existing.mcp) || {}) };
  for (const [name, block] of Object.entries(desiredMcp)) {
    if (mcp[name] !== undefined && JSON.stringify(mcp[name]) !== JSON.stringify(block)) {
      throw new Error(`opencode.json already configures MCP server "${name}" differently; remove or update it by hand first`);
    }
    mcp[name] = block;
  }
  out.mcp = mcp;
  if (desiredTools) {
    out.tools = mergeToolsMap((existing && existing.tools) || {}, desiredTools);
  }
  return out;
}

// Adds our denials to the user's tools map. Anything already false stays;
// anything enabled that we deny is a conflict for the human, never a silent
// flip: they may have enabled it on purpose.
export function mergeToolsMap(existingTools, desiredTools) {
  const tools = { ...(existingTools ?? {}) };
  for (const [name, value] of Object.entries(desiredTools)) {
    if (tools[name] !== undefined && tools[name] !== value) {
      throw new Error(`opencode.json already sets tool "${name}" differently; remove or update it by hand first`);
    }
    tools[name] = value;
  }
  return tools;
}
