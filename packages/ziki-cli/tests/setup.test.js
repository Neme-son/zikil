import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSetupPlan, applySetupPlan, cmdSetupOpencode, parseJsonc, diffLines, formatPlan } from '../src/commands/setup-opencode.js';

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

test('opencode.jsonc merges in place with warning, confirm and backup', () => {
  const home = makeHome();
  try {
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'opencode.jsonc'), '{\n  // mine\n  "theme": "dark",\n}\n');
    const plan = buildSetupPlan(baseInput(home));
    const entry = plan.files.find((f) => f.path.endsWith('opencode.jsonc'));
    assert.equal(entry.status, 'update');
    assert.equal(entry.reason, 'jsonc');
    assert.equal(entry.requiresConfirmation, true);
    assert.match(formatPlan(plan), /comments and formatting in this file will be removed/);
    const written = applySetupPlan(plan, { confirm: [entry.path], yes: true });
    assert.ok(written.includes(entry.path));
    const merged = JSON.parse(fs.readFileSync(path.join(cfgDir, 'opencode.jsonc'), 'utf8'));
    assert.equal(merged.theme, 'dark');
    assert.ok(merged.mcp.ziki);
    const backups = fs.readdirSync(cfgDir).filter((n) => n.startsWith('opencode.jsonc.ziki-backup-'));
    assert.equal(backups.length, 1);
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
    assert.match(result.text, /MCP server missing/);
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

test('interactive yes applies after showing the plan', async () => {
  const home = makeHome();
  try {
    fs.writeFileSync(path.join(home, 'index.js'), '// fake mcp');
    const shown = [];
    const asked = [];
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpServer: path.join(home, 'index.js') },
      { home, root: CLI_ROOT, asker: { confirm: async (q) => { asked.push(q); return true; } }, out: (line) => shown.push(line) },
    );
    assert.equal(result.code, 0);
    assert.match(result.text, /wrote \d+ file/);
    assert.equal(asked.length, 1);
    assert.match(asked[0], /Apply these changes\? \[y\/N\]/);
    assert.ok(shown.join('\n').includes('opencode.json'));
    assert.ok(fs.existsSync(path.join(home, '.config', 'opencode', 'opencode.json')));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('interactive no stops cleanly without writing', async () => {
  const home = makeHome();
  try {
    fs.writeFileSync(path.join(home, 'index.js'), '// fake mcp');
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpServer: path.join(home, 'index.js') },
      { home, root: CLI_ROOT, asker: { confirm: async () => false }, out: () => {} },
    );
    assert.equal(result.code, 0);
    assert.match(result.text, /not applied/);
    assert.equal(fs.existsSync(path.join(home, '.config')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('interactive yes confirms and backs up an existing config', async () => {
  const home = makeHome();
  try {
    fs.writeFileSync(path.join(home, 'index.js'), '// fake mcp');
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'opencode.json'), JSON.stringify({ theme: 'dark' }));
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpServer: path.join(home, 'index.js') },
      { home, root: CLI_ROOT, asker: { confirm: async () => true }, out: () => {} },
    );
    assert.equal(result.code, 0);
    const merged = JSON.parse(fs.readFileSync(path.join(cfgDir, 'opencode.json'), 'utf8'));
    assert.equal(merged.theme, 'dark');
    assert.ok(merged.mcp.ziki);
    const backups = fs.readdirSync(cfgDir).filter((n) => n.startsWith('opencode.json.ziki-backup-'));
    assert.equal(backups.length, 1);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('parseJsonc strips comments and trailing commas, keeps strings intact', () => {
  const doc = parseJsonc(`{
    // line comment
    "a": 1, /* block comment */
    "url": "http://x/y?z=1,2",
    "weird": "/* not a comment, ]/trailing",
    "list": [1, 2,],
  }`);
  assert.deepEqual(doc, { a: 1, url: 'http://x/y?z=1,2', weird: '/* not a comment, ]/trailing', list: [1, 2] });
});

test('parseJsonc throws on invalid input', () => {
  assert.throws(() => parseJsonc('{ broken,,,'), SyntaxError);
  assert.throws(() => parseJsonc('{"a": 1 /* unterminated'), SyntaxError);
});

test('diffLines marks removed, added and kept lines', () => {
  assert.deepEqual(diffLines('a\nb\nc', 'a\nx\nc'), ['  a', '- b', '+ x', '  c']);
  assert.deepEqual(diffLines('a', 'a\nb'), ['  a', '+ b']);
});

test('JSONC opencode.json merges as a confirmed update, warns, and backs up', () => {
  const home = makeHome();
  try {
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    const jsonc = `{\n  // my theme\n  "theme": "dark", /* inline */\n  "extra": [1,],\n}\n`;
    fs.writeFileSync(path.join(cfgDir, 'opencode.json'), jsonc);
    const plan = buildSetupPlan(baseInput(home));
    const entry = plan.files.find((f) => f.path.endsWith('opencode.json'));
    assert.equal(entry.status, 'update');
    assert.equal(entry.reason, 'jsonc');
    assert.equal(entry.requiresConfirmation, true);
    const text = formatPlan(plan);
    assert.match(text, /comments and formatting in this file will be removed/);
    assert.match(text, /- .*my theme/);
    assert.match(text, /\+.*"ziki"/);
    assert.ok(!entry.desiredText.includes('apiKey'));
    assert.throws(() => applySetupPlan(plan, { confirm: [], yes: true }), /--confirm/);
    const written = applySetupPlan(plan, { confirm: [entry.path], yes: true });
    assert.ok(written.includes(entry.path));
    const after = fs.readFileSync(path.join(cfgDir, 'opencode.json'), 'utf8');
    const merged = JSON.parse(after);
    assert.equal(merged.theme, 'dark');
    assert.deepEqual(merged.extra, [1]);
    assert.ok(merged.mcp.ziki);
    assert.ok(!after.includes('my theme'));
    const backups = fs.readdirSync(cfgDir).filter((n) => n.startsWith('opencode.json.ziki-backup-'));
    assert.equal(backups.length, 1);
    assert.ok(fs.readFileSync(path.join(cfgDir, backups[0]), 'utf8').includes('my theme'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('unparseable opencode.json stays blocked with the hand-merge block', () => {
  const home = makeHome();
  try {
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'opencode.json'), '{ nope,,,');
    const plan = buildSetupPlan(baseInput(home));
    const entry = plan.files.find((f) => f.path.endsWith('opencode.json'));
    assert.equal(entry.status, 'blocked');
    assert.match(entry.detail, /by hand/);
    const text = formatPlan(plan);
    assert.match(text, /blocked.*opencode\.json/);
    assert.match(text, /"ziki"/);
    assert.throws(() => applySetupPlan(plan, { confirm: [entry.path], yes: true }), /blocked/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

