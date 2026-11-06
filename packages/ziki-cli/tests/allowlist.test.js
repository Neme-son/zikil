import test from 'node:test';
import assert from 'node:assert/strict';
import { ZIKI_MCP_TOOL_ALLOWLIST } from '../src/allowlist.js';

test('allowlist is exactly the 16 reviewed read-only tools from issue #464', () => {
  assert.deepEqual([...ZIKI_MCP_TOOL_ALLOWLIST].sort(), [
    'ziki_count_issues',
    'ziki_get_idea',
    'ziki_get_issue',
    'ziki_get_project',
    'ziki_get_project_mistakes',
    'ziki_get_work',
    'ziki_list_bids',
    'ziki_list_comments',
    'ziki_list_confirmations',
    'ziki_list_deliveries',
    'ziki_list_idea_verdicts',
    'ziki_list_ideas',
    'ziki_list_issues',
    'ziki_list_merge_reviews',
    'ziki_list_test_verdicts',
    'ziki_whoami',
  ]);
});

test('allowlist has no duplicates and every entry is a ziki_ tool', () => {
  assert.equal(new Set(ZIKI_MCP_TOOL_ALLOWLIST).size, ZIKI_MCP_TOOL_ALLOWLIST.length);
  assert.ok(ZIKI_MCP_TOOL_ALLOWLIST.every((name) => name.startsWith('ziki_')));
});
