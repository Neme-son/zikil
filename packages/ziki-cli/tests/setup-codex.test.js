import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCodexPlan, cmdSetupCodex, EXPERIMENTAL_NOTE } from '../src/commands/setup-codex.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function makeHome() {
  const bases = [os.tmpdir(), path.join(HERE, '.tmp')];
  for (const base of bases) {
    try {
      if (base !== os.tmpdir()) fs.mkdirSync(base, { recursive: true });
      return fs.mkdtempSync(path.join(base, `ziki-codex-${process.pid}-`));
    } catch {
      // try the next base
    }
  }
  throw new Error('no writable temp directory');
}

test('plan is experimental, prints without writing', async () => {
  const home = makeHome();
  try {
    const fakeMcp = path.join(home, 'mcp.cjs');
    fs.writeFileSync(fakeMcp, '// fake');
    const result = await cmdSetupCodex({ server: 'https://ziki.dev', mcpPath: fakeMcp }, { home, root: home });
    assert.equal(result.code, 0);
    assert.ok(result.text.includes(EXPERIMENTAL_NOTE));
    assert.match(result.text, /config\.toml/);
    assert.equal(fs.existsSync(path.join(home, '.codex')), false);
    const plan = buildCodexPlan({ home, serverUrl: 'https://ziki.dev', mcpServerPath: fakeMcp });
    assert.equal(plan.files[0].status, 'create');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('command stops with the build command when no server resolves', async () => {
  const home = makeHome();
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), `ziki-cli-bare-${process.pid}-`));
  try {
    const cliRoot = path.join(home, 'cli');
    fs.mkdirSync(cliRoot, { recursive: true });
    const result = await cmdSetupCodex({ server: 'https://ziki.dev' }, { home, root: cliRoot, cwd: bare });
    assert.equal(result.code, 1);
    assert.match(result.text, /MCP server not found/);
    assert.match(result.text, /pnpm --dir packages\/mcp-server build/);
    assert.match(result.text, /--mcp-path/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(bare, { recursive: true, force: true });
  }
});

test('apply writes the block and backs up an existing config', async () => {
  const home = makeHome();
  try {
    const fakeMcp = path.join(home, 'mcp.cjs');
    fs.writeFileSync(fakeMcp, '// fake');
    const cfgDir = path.join(home, '.codex');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.toml'), '[other]\n');
    const cfg = path.join(cfgDir, 'config.toml');
    const plan = buildCodexPlan({ home, serverUrl: 'https://ziki.dev', mcpServerPath: fakeMcp });
    assert.equal(plan.files[0].status, 'update');
    const refused = await cmdSetupCodex({ apply: true, yes: true, server: 'https://ziki.dev', mcpPath: fakeMcp }, { home, root: home }).catch((e) => e);
    assert.ok(refused instanceof Error);
    const done = await cmdSetupCodex(
      { apply: true, yes: true, confirm: [cfg], server: 'https://ziki.dev', mcpPath: fakeMcp },
      { home, root: home },
    );
    assert.equal(done.code, 0);
    const text = fs.readFileSync(cfg, 'utf8');
    assert.ok(text.startsWith('[other]\n'));
    assert.ok(text.includes('[mcp_servers.ziki]'));
    assert.equal(fs.readdirSync(cfgDir).filter((n) => n.startsWith('config.toml.ziki-backup-')).length, 1);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('foreign ziki table blocks with instructions', () => {
  const home = makeHome();
  try {
    const plan = buildCodexPlan({
      home,
      serverUrl: 'https://ziki.dev',
      mcpServerPath: '/x',
      io: { readTarget: () => ({ kind: 'file', text: '[mcp_servers.ziki]\ncommand = "x"\n' }) },
    });
    assert.equal(plan.files[0].status, 'blocked');
    assert.match(plan.files[0].detail, /by hand/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('interactive yes applies after asking', async () => {
  const home = makeHome();
  try {
    const fakeMcp = path.join(home, 'mcp.cjs');
    fs.writeFileSync(fakeMcp, '// fake');
    const asked = [];
    const result = await cmdSetupCodex(
      { server: 'https://ziki.dev', mcpPath: fakeMcp },
      { home, root: home, asker: { confirm: async (q) => { asked.push(q); return true; } }, out: () => {} },
    );
    assert.equal(result.code, 0);
    assert.equal(asked.length, 1);
    assert.match(asked[0], /Apply these changes\? \[y\/N\]/);
    assert.ok(fs.existsSync(path.join(home, '.codex', 'config.toml')));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('interactive no stops cleanly without writing', async () => {
  const home = makeHome();
  try {
    const fakeMcp = path.join(home, 'mcp.cjs');
    fs.writeFileSync(fakeMcp, '// fake');
    const result = await cmdSetupCodex(
      { server: 'https://ziki.dev', mcpPath: fakeMcp },
      { home, root: home, asker: { confirm: async () => false }, out: () => {} },
    );
    assert.equal(result.code, 0);
    assert.match(result.text, /not applied/);
    assert.equal(fs.existsSync(path.join(home, '.codex')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
