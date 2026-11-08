import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  OPENCODE_GLOBAL_DIR,
  OPENCODE_MCP_SERVER_NAME,
  DENIED_MCP_TOOLS,
  ZIKI_TOOL_DENY_GLOB,
  buildMcpBlock,
  buildToolsMap,
  exposedToolName,
  resolveMcpServerPath,
  mergeOpencodeConfig,
  mergeToolsMap,
} from '../../src/adapters/opencode.js';
import { ZIKI_MCP_TOOL_ALLOWLIST } from '../../src/allowlist.js';

test('global dir is ~/.config/opencode', () => {
  assert.equal(OPENCODE_GLOBAL_DIR('/home/u'), path.join('/home/u', '.config', 'opencode'));
});

test('mcp block uses stdio command plus server env', () => {
  const block = buildMcpBlock({ serverPath: '/x/dist/index.js', serverUrl: 'http://localhost:3001' });
  assert.deepEqual(block, {
    ziki: {
      type: 'local',
      command: ['node', '/x/dist/index.js'],
      environment: { ZIKI_URL: 'http://localhost:3001' },
      enabled: true,
    },
  });
});

test('mcp server path prefers explicit flag, then env, then checkout autodetect', () => {
  assert.equal(
    resolveMcpServerPath({ flag: '/f/index.js', env: {}, cliRoot: '/c' }),
    '/f/index.js',
  );
  assert.equal(
    resolveMcpServerPath({ flag: undefined, env: { ZIKI_MCP_SERVER: '/e/index.js' }, cliRoot: '/c' }),
    '/e/index.js',
  );
  const auto = resolveMcpServerPath({ flag: undefined, env: {}, cliRoot: '/repo/packages/ziki-cli' });
  assert.ok(auto.endsWith(path.join('mcp-server', 'dist', 'index.js')));
  const vendorBase = (() => {
    try {
      const probe = path.join(os.tmpdir(), 'ziki-cli-probe');
      fs.mkdirSync(probe, { recursive: true });
      fs.rmdirSync(probe);
      return os.tmpdir();
    } catch {
      const local = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
      fs.mkdirSync(local, { recursive: true });
      return local;
    }
  })();
  const vendorRoot = fs.mkdtempSync(path.join(vendorBase, 'ziki-cli-vendor-'));
  fs.mkdirSync(path.join(vendorRoot, 'vendor'), { recursive: true });
  fs.writeFileSync(path.join(vendorRoot, 'vendor', 'mcp-server.cjs'), '// bundle');
  assert.equal(
    resolveMcpServerPath({ flag: undefined, env: {}, cliRoot: vendorRoot }),
    path.join(vendorRoot, 'vendor', 'mcp-server.cjs'),
  );
  fs.rmSync(vendorRoot, { recursive: true, force: true });
});

test('merge adds the ziki block and preserves everything else', () => {
  const merged = mergeOpencodeConfig(
    { theme: 'dark', mcp: { other: { type: 'local', command: ['x'] } } },
    { ziki: { type: 'local', command: ['node', '/x'] } },
  );
  assert.equal(merged.theme, 'dark');
  assert.deepEqual(merged.mcp.other, { type: 'local', command: ['x'] });
  assert.deepEqual(merged.mcp.ziki, { type: 'local', command: ['node', '/x'] });
});

test('merge refuses to silently replace a different ziki block', () => {
  assert.throws(
    () =>
      mergeOpencodeConfig({ mcp: { ziki: { type: 'local', command: ['other'] } } }, { ziki: { type: 'local', command: ['node', '/x'] } }),
    /already configures/,
  );
});

test('merge accepts an identical ziki block as unchanged', () => {
  const block = { ziki: { type: 'local', command: ['node', '/x'] } };
  const merged = mergeOpencodeConfig({ mcp: block }, block);
  assert.deepEqual(merged.mcp, block);
});

test('exposed names prefix the MCP name with the server name', () => {
  assert.equal(exposedToolName('ziki_get_work'), `${OPENCODE_MCP_SERVER_NAME}_ziki_get_work`);
});

test('denied list is 96 audited tools, disjoint from the 16 allowlisted', () => {
  assert.equal(DENIED_MCP_TOOLS.length, 96);
  assert.equal(new Set(DENIED_MCP_TOOLS).size, 96);
  const allowed = new Set(ZIKI_MCP_TOOL_ALLOWLIST);
  assert.ok(DENIED_MCP_TOOLS.every((name) => !allowed.has(name)));
  assert.ok(DENIED_MCP_TOOLS.every((name) => name.startsWith('ziki_')));
});

test('tools map denies the backstop glob plus every denied tool, nothing allowlisted', () => {
  const tools = buildToolsMap();
  assert.equal(tools[ZIKI_TOOL_DENY_GLOB], false);
  assert.equal(Object.keys(tools).length, 1 + DENIED_MCP_TOOLS.length);
  assert.ok(Object.values(tools).every((value) => value === false));
  for (const allowed of ZIKI_MCP_TOOL_ALLOWLIST) {
    assert.equal(tools[exposedToolName(allowed)], undefined);
  }
  assert.equal(tools[exposedToolName('ziki_deliver')], false);
  assert.equal(tools[exposedToolName('ziki_bid')], false);
});

test('tools merge preserves foreign entries and accepts already-denied', () => {
  const merged = mergeToolsMap({ other_tool: true }, { 'ziki_*': false, ziki_ziki_bid: false });
  assert.equal(merged.other_tool, true);
  assert.equal(merged['ziki_*'], false);
  const again = mergeToolsMap({ ziki_ziki_bid: false }, { ziki_ziki_bid: false });
  assert.equal(again.ziki_ziki_bid, false);
});

test('tools merge refuses to silently flip an enabled denied tool', () => {
  assert.throws(() => mergeToolsMap({ ziki_ziki_bid: true }, { ziki_ziki_bid: false }), /already sets tool/);
});

test('config merge carries the tools map alongside mcp', () => {
  const merged = mergeOpencodeConfig({ theme: 'dark' }, { ziki: { type: 'local' } }, { 'ziki_*': false });
  assert.equal(merged.theme, 'dark');
  assert.deepEqual(merged.tools, { 'ziki_*': false });
});

test('forced merge overwrites a different ziki block and preserves everything else', () => {
  const merged = mergeOpencodeConfig(
    { theme: 'dark', mcp: { other: { type: 'local' }, ziki: { type: 'local', command: ['other'] } } },
    { ziki: { type: 'local', command: ['node', '/x'] } },
    undefined,
    { force: true },
  );
  assert.equal(merged.theme, 'dark');
  assert.deepEqual(merged.mcp.other, { type: 'local' });
  assert.deepEqual(merged.mcp.ziki, { type: 'local', command: ['node', '/x'] });
});

test('forced tools merge flips owned denials and preserves foreign entries', () => {
  const merged = mergeToolsMap({ other_tool: true, ziki_ziki_bid: true }, { ziki_ziki_bid: false }, { force: true });
  assert.equal(merged.other_tool, true);
  assert.equal(merged.ziki_ziki_bid, false);
});

test('conflict messages name the real config file', () => {
  assert.throws(
    () => mergeOpencodeConfig({ mcp: { ziki: { type: 'x' } } }, { ziki: { type: 'y' } }, undefined, { filename: 'opencode.jsonc' }),
    /opencode\.jsonc already configures/,
  );
  assert.throws(
    () => mergeToolsMap({ 'ziki_*': true }, { 'ziki_*': false }, { filename: 'opencode.jsonc' }),
    /opencode\.jsonc already sets tool/,
  );
});
