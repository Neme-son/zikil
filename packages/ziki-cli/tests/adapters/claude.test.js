import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  CLAUDE_SETTINGS_PATH,
  buildMcpAddCommand,
  buildDenyRules,
  claudeDenyId,
  mergeSettingsDeny,
} from '../../src/adapters/claude.js';
import { ZIKI_MCP_TOOL_DENYLIST } from '../../src/allowlist.js';

test('claude settings live at ~/.claude/settings.json', () => {
  assert.equal(CLAUDE_SETTINGS_PATH('/home/u'), path.join('/home/u', '.claude', 'settings.json'));
});

test('mcp add command needs no env: the pairing file carries the URL', () => {
  const cmd = buildMcpAddCommand({ serverPath: '/x/mcp-server.cjs' });
  assert.equal(cmd, 'claude mcp add --transport stdio --scope user ziki -- node /x/mcp-server.cjs');
  assert.ok(!cmd.includes('ZIKI_URL'));
});

test('deny rules name every denied tool in mcp__server__tool form', () => {
  assert.equal(claudeDenyId('ziki_deliver'), 'mcp__ziki__ziki_deliver');
  const rules = buildDenyRules();
  assert.equal(rules.length, ZIKI_MCP_TOOL_DENYLIST.length);
  assert.ok(rules.includes('mcp__ziki__ziki_bid'));
});

test('settings merge is additive and dedupes', () => {
  const merged = mergeSettingsDeny({ theme: 'dark', permissions: { deny: ['Bash(rm *)'] } }, ['mcp__ziki__ziki_bid']);
  assert.equal(merged.theme, 'dark');
  assert.deepEqual(merged.permissions.deny, ['Bash(rm *)', 'mcp__ziki__ziki_bid']);
  const again = mergeSettingsDeny(merged, ['mcp__ziki__ziki_bid']);
  assert.deepEqual(again.permissions.deny, ['Bash(rm *)', 'mcp__ziki__ziki_bid']);
  assert.deepEqual(mergeSettingsDeny(null, ['a']).permissions.deny, ['a']);
});
