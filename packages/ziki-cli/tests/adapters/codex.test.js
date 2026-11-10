import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  CODEX_CONFIG_PATH,
  MANAGED_BEGIN,
  MANAGED_END,
  buildCodexBlock,
  upsertManagedBlock,
  codexToolId,
} from '../../src/adapters/codex.js';
import { ZIKI_MCP_TOOL_ALLOWLIST, ZIKI_MCP_TOOL_DENYLIST } from '../../src/allowlist.js';

test('codex config lives at ~/.codex/config.toml', () => {
  assert.equal(CODEX_CONFIG_PATH('/home/u'), path.join('/home/u', '.codex', 'config.toml'));
});

test('tool ids are the plain MCP wire names (unverified assumption, flagged in output)', () => {
  assert.equal(codexToolId('ziki_get_work'), 'ziki_get_work');
});

test('block carries the server, all 16 allowed and all 96 denied', () => {
  const block = buildCodexBlock({ serverPath: '/x/mcp-server.cjs', serverUrl: 'https://ziki.dev' });
  assert.match(block, /\[mcp_servers\.ziki\]/);
  assert.match(block, /\/x\/mcp-server\.cjs/);
  assert.match(block, /https:\/\/ziki\.dev/);
  for (const name of ZIKI_MCP_TOOL_ALLOWLIST) {
    assert.ok(block.includes(`"${name}"`), name);
  }
  assert.equal(ZIKI_MCP_TOOL_DENYLIST.length, 96);
  assert.ok(block.includes('"ziki_deliver"'));
  assert.ok(block.startsWith(MANAGED_BEGIN));
  assert.ok(block.trimEnd().endsWith(MANAGED_END));
});

test('upsert appends to fresh or foreign configs and replaces its own block', () => {
  const block = buildCodexBlock({ serverPath: '/x', serverUrl: 'https://ziki.dev' });
  assert.equal(upsertManagedBlock('', block), block);
  const appended = upsertManagedBlock('[other]\nx = 1\n', block);
  assert.ok(appended.startsWith('[other]\nx = 1\n'));
  assert.ok(appended.includes(MANAGED_BEGIN));
  const replaced = upsertManagedBlock(`head\n${block}tail\n`, buildCodexBlock({ serverPath: '/y', serverUrl: 'https://ziki.dev' }));
  assert.ok(replaced.startsWith('head\n'));
  assert.ok(replaced.includes('/y'));
  assert.ok(!replaced.includes('/x'));
});

test('upsert refuses foreign ziki tables and half-written markers', () => {
  const block = buildCodexBlock({ serverPath: '/x', serverUrl: 'https://ziki.dev' });
  assert.throws(() => upsertManagedBlock('[mcp_servers.ziki]\ncommand = "x"\n', block), /by hand/);
  assert.throws(() => upsertManagedBlock(`${MANAGED_BEGIN}\npartial`, block), /half-written/);
});
