import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSetupPlan, applySetupPlan, cmdSetupOpencode } from '../src/commands/setup-opencode.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.join(HERE, '..');

function makeHome() {
  const bases = [os.tmpdir(), path.join(HERE, '.tmp')];
  for (const base of bases) {
    try {
      if (base !== os.tmpdir()) {
        fs.mkdirSync(base, { recursive: true });
      }
      return fs.mkdtempSync(path.join(base, `ziki-setup-${process.pid}-`));
    } catch {
      // try the next base
    }
  }
  throw new Error('no writable temp directory');
}

function baseInput(home) {
  return {
    home,
    cliRoot: CLI_ROOT,
    serverUrl: 'http://localhost:3001',
    mcpServerPath: '/x/dist/index.js',
    persona: 'keep',
  };
}

test('empty home plans everything as create without confirmation', () => {
  const home = makeHome();
  try {
    const plan = buildSetupPlan(baseInput(home));
    assert.ok(plan.files.length >= 4);
    assert.ok(plan.files.every((f) => f.status === 'create'));
    assert.ok(plan.files.every((f) => f.requiresConfirmation === false));
    assert.ok(plan.files.some((f) => f.path.endsWith('opencode.json')));
    assert.ok(plan.files.some((f) => f.path.endsWith('SKILL.md')));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('apply then replan is fully unchanged', () => {
  const home = makeHome();
  try {
    const plan = buildSetupPlan(baseInput(home));
    const written = applySetupPlan(plan, { confirm: [], yes: true });
    assert.ok(written.length >= 4);
    const again = buildSetupPlan(baseInput(home));
    assert.ok(again.files.every((f) => f.status === 'unchanged'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('apply refuses without --yes', () => {
  const home = makeHome();
  try {
    const plan = buildSetupPlan(baseInput(home));
    assert.throws(() => applySetupPlan(plan, { confirm: [], yes: false }), /--yes/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('foreign opencode.json merges as a confirmed update with backup', () => {
  const home = makeHome();
  try {
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'opencode.json'), JSON.stringify({ theme: 'dark' }));
    const plan = buildSetupPlan(baseInput(home));
    const entry = plan.files.find((f) => f.path.endsWith('opencode.json'));
    assert.equal(entry.status, 'update');
    assert.equal(entry.requiresConfirmation, true);
    const written = applySetupPlan(plan, { confirm: [entry.path], yes: true });
    assert.ok(written.includes(entry.path));
    const merged = JSON.parse(fs.readFileSync(path.join(cfgDir, 'opencode.json'), 'utf8'));
    assert.equal(merged.theme, 'dark');
    assert.ok(merged.mcp.ziki);
    assert.equal(merged.tools['ziki_*'], false);
    assert.equal(merged.tools.ziki_ziki_deliver, false);
    assert.equal(merged.tools.ziki_ziki_get_work, undefined);
    const backups = fs.readdirSync(cfgDir).filter((n) => n.startsWith('opencode.json.ziki-backup-'));
    assert.equal(backups.length, 1);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('opencode.jsonc blocks with manual-merge instructions', () => {
  const home = makeHome();
  try {
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'opencode.jsonc'), '{ /* comments */ }');
    const plan = buildSetupPlan(baseInput(home));
    const entry = plan.files.find((f) => f.path.endsWith('opencode.json'));
    assert.equal(entry.status, 'blocked');
    assert.match(entry.detail, /by hand/);
    assert.throws(() => applySetupPlan(plan, { confirm: [], yes: true }), /blocked/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('command prints a plan without writing', async () => {
  const home = makeHome();
  try {
    const fakeMcp = path.join(home, 'index.js');
    fs.writeFileSync(fakeMcp, '// fake mcp');
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpServer: fakeMcp },
      { home, root: CLI_ROOT },
    );
    assert.equal(result.code, 0);
    assert.match(result.text, /opencode\.json/);
    assert.match(result.text, /SKILL\.md/);
    assert.equal(fs.existsSync(path.join(home, '.config')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('command apply writes the full adapter set', async () => {
  const home = makeHome();
  try {
    const fakeMcp = path.join(home, 'index.js');
    fs.writeFileSync(fakeMcp, '// fake mcp');
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpServer: fakeMcp, apply: true, yes: true, persona: 'example' },
      { home, root: CLI_ROOT },
    );
    assert.equal(result.code, 0);
    const cfg = path.join(home, '.config', 'opencode');
    assert.ok(JSON.parse(fs.readFileSync(path.join(cfg, 'opencode.json'), 'utf8')).mcp.ziki);
    assert.ok(fs.existsSync(path.join(cfg, 'skills', 'ziki-work', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(cfg, 'skills', 'ziki-work', 'protocol.md')));
    assert.ok(fs.existsSync(path.join(cfg, 'skills', 'ziki-work', 'persona.md')));
    assert.ok(fs.existsSync(path.join(cfg, 'commands', 'ziki-work.md')));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('command refuses when the MCP server is not built', async () => {
  const home = makeHome();
  try {
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpServer: path.join(home, 'missing.js') },
      { home, root: CLI_ROOT },
    );
    assert.equal(result.code, 1);
    assert.match(result.text, /not built/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('persona example installs, default keeps existing untouched', () => {
  const home = makeHome();
  try {
    const withExample = buildSetupPlan({ ...baseInput(home), persona: 'example' });
    assert.ok(withExample.files.some((f) => f.path.endsWith('persona.md') && f.status === 'create'));
    const plain = buildSetupPlan(baseInput(home));
    assert.ok(!plain.files.some((f) => f.path.endsWith('persona.md')));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
