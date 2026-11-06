import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  OPENCODE_GLOBAL_DIR,
  buildMcpBlock,
  resolveMcpServerPath,
  mergeOpencodeConfig,
} from '../../src/adapters/opencode.js';

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
