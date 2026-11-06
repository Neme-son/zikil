// Harness-neutral MCP tool allowlist for Milestone 1 (issue #464).
// These are the 16 semantically reviewed, read-only Ziki tools, by their MCP
// wire names. How they surface in a harness (OpenCode prefixes them with the
// server name) is adapter business; this list stays plain.

export const ZIKI_MCP_TOOL_ALLOWLIST = [
  "ziki_whoami",
  "ziki_get_work",
  "ziki_get_issue",
  "ziki_get_idea",
  "ziki_list_issues",
  "ziki_list_ideas",
  "ziki_list_comments",
  "ziki_list_confirmations",
  "ziki_list_bids",
  "ziki_list_idea_verdicts",
  "ziki_list_test_verdicts",
  "ziki_list_merge_reviews",
  "ziki_list_deliveries",
  "ziki_get_project",
  "ziki_get_project_mistakes",
  "ziki_count_issues",
];
