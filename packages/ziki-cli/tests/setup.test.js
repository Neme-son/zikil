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
      { server: 'http://localhost:3001', mcpPath: fakeMcp },
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
      { server: 'http://localhost:3001', mcpPath: fakeMcp, apply: true, yes: true, persona: 'example' },
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
      { server: 'http://localhost:3001', mcpPath: path.join(home, 'missing.js') },
      { home, root: CLI_ROOT },
    );
    assert.equal(result.code, 1);
    assert.match(result.text, /MCP server missing/);
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
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001' },
      { home, root: cliRoot, cwd: bare },
    );
    assert.equal(result.code, 1);
    assert.match(result.text, /MCP server not found/);
    assert.match(result.text, /pnpm --dir packages\/mcp-server build/);
    assert.match(result.text, /--mcp-path/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(bare, { recursive: true, force: true });
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
      { server: 'http://localhost:3001', mcpPath: path.join(home, 'index.js') },
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
      { server: 'http://localhost:3001', mcpPath: path.join(home, 'index.js') },
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
      { server: 'http://localhost:3001', mcpPath: path.join(home, 'index.js') },
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

test('ours-and-different config updates without asking to replace', () => {
  const home = makeHome();
  try {
    const first = buildSetupPlan(baseInput(home));
    applySetupPlan(first, { confirm: [], yes: true });
    const cfgPath = path.join(home, '.config', 'opencode', 'opencode.json');
    const plan = buildSetupPlan({ ...baseInput(home), serverUrl: 'http://localhost:3002' });
    const entry = plan.files.find((f) => f.path === cfgPath);
    assert.equal(entry.status, 'update');
    assert.equal(entry.reason, 'generated');
    assert.equal(entry.requiresReplace, undefined);
    const text = formatPlan(plan);
    assert.match(text, /re-run with: --apply --yes --confirm/);
    assert.doesNotMatch(text, /--replace-ziki/);
    const written = applySetupPlan(plan, { confirm: [entry.path], yes: true });
    assert.ok(written.includes(entry.path));
    const merged = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert.equal(merged.mcp.ziki.environment.ZIKI_URL, 'http://localhost:3002');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('owned tool denials update without asking to replace', () => {
  const home = makeHome();
  try {
    const first = buildSetupPlan(baseInput(home));
    applySetupPlan(first, { confirm: [], yes: true });
    const cfgPath = path.join(home, '.config', 'opencode', 'opencode.json');
    const edited = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    edited.tools.ziki_ziki_bid = true;
    fs.writeFileSync(cfgPath, JSON.stringify(edited));
    const plan = buildSetupPlan(baseInput(home));
    const entry = plan.files.find((f) => f.path === cfgPath);
    assert.equal(entry.status, 'update');
    assert.equal(entry.reason, 'modified-since-recorded');
    assert.equal(entry.requiresReplace, undefined);
    const written = applySetupPlan(plan, { confirm: [entry.path], yes: true });
    assert.ok(written.includes(entry.path));
    const merged = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert.equal(merged.tools.ziki_ziki_bid, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('foreign-and-different config plans as replace with a ziki-entry-only diff', () => {
  const home = makeHome();
  try {
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, 'opencode.json'),
      JSON.stringify({ theme: 'dark', mcp: { other: { type: 'local', command: ['other'] }, ziki: { type: 'local', command: ['foreign'] } } }),
    );
    const plan = buildSetupPlan(baseInput(home));
    const entry = plan.files.find((f) => f.path.endsWith('opencode.json'));
    assert.equal(entry.status, 'update');
    assert.equal(entry.reason, 'foreign');
    assert.equal(entry.requiresReplace, true);
    assert.equal(entry.requiresConfirmation, true);
    const text = formatPlan(plan);
    assert.match(text, /\[needs --replace-ziki\]/);
    assert.match(text, /-.*"foreign"/);
    assert.match(text, /\+.*"\/x\/dist\/index\.js"/);
    assert.ok(!text.includes('"other"'));
    assert.match(text, /re-run with: --apply --yes --replace-ziki --confirm/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('interactive yes replaces a foreign entry with a backup, keeping the rest', async () => {
  const home = makeHome();
  try {
    fs.writeFileSync(path.join(home, 'index.js'), '// fake mcp');
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    const before = JSON.stringify({ theme: 'dark', mcp: { other: { type: 'local', command: ['other'] }, ziki: { type: 'local', command: ['foreign'] } } });
    fs.writeFileSync(path.join(cfgDir, 'opencode.json'), before);
    const asked = [];
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpPath: path.join(home, 'index.js') },
      { home, root: CLI_ROOT, asker: { confirm: async (q) => { asked.push(q); return true; } }, out: () => {} },
    );
    assert.equal(result.code, 0);
    assert.match(result.text, /wrote \d+ file/);
    assert.equal(asked.length, 2);
    assert.match(asked[0], /Apply these changes\?/);
    assert.match(asked[1], /Replace the existing ziki entry\? A backup is made first\. \[y\/N\]/);
    const merged = JSON.parse(fs.readFileSync(path.join(cfgDir, 'opencode.json'), 'utf8'));
    assert.equal(merged.theme, 'dark');
    assert.deepEqual(merged.mcp.other, { type: 'local', command: ['other'] });
    assert.deepEqual(merged.mcp.ziki.command, ['node', path.join(home, 'index.js')]);
    assert.ok(!JSON.stringify(merged).includes('foreign'));
    const backups = fs.readdirSync(cfgDir).filter((n) => n.startsWith('opencode.json.ziki-backup-'));
    assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(path.join(cfgDir, backups[0]), 'utf8'), before);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('interactive no on replace leaves the file unchanged', async () => {
  const home = makeHome();
  try {
    fs.writeFileSync(path.join(home, 'index.js'), '// fake mcp');
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    const before = JSON.stringify({ mcp: { ziki: { type: 'local', command: ['foreign'] } } });
    fs.writeFileSync(path.join(cfgDir, 'opencode.json'), before);
    const asked = [];
    const answers = [true, false];
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpPath: path.join(home, 'index.js') },
      { home, root: CLI_ROOT, asker: { confirm: async (q) => { asked.push(q); return answers.shift(); } }, out: () => {} },
    );
    assert.equal(result.code, 0);
    assert.match(result.text, /not applied/);
    assert.equal(asked.length, 2);
    assert.equal(fs.readFileSync(path.join(cfgDir, 'opencode.json'), 'utf8'), before);
    assert.ok(!fs.readdirSync(cfgDir).some((n) => n.includes('.ziki-backup-')));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('blocked plan never asks to apply and names the real file', async () => {
  const home = makeHome();
  try {
    fs.writeFileSync(path.join(home, 'index.js'), '// fake mcp');
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'opencode.jsonc'), '{ nope,,,');
    const asked = [];
    const shown = [];
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpPath: path.join(home, 'index.js') },
      { home, root: CLI_ROOT, asker: { confirm: async (q) => { asked.push(q); return true; } }, out: (line) => shown.push(line) },
    );
    assert.equal(result.code, 1);
    assert.match(result.text, /cannot apply with blocked entries/);
    assert.match(result.text, /opencode\.jsonc/);
    assert.match(result.text, /re-run/);
    assert.deepEqual(asked, []);
    assert.ok(shown.join('\n').includes('blocked'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('non-TTY replace needs --replace-ziki with --apply --yes --confirm', async () => {
  const home = makeHome();
  try {
    fs.writeFileSync(path.join(home, 'index.js'), '// fake mcp');
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'opencode.json'), JSON.stringify({ mcp: { ziki: { type: 'local', command: ['foreign'] } } }));
    const plan = buildSetupPlan({ ...baseInput(home), mcpServerPath: path.join(home, 'index.js') });
    const entry = plan.files.find((f) => f.path.endsWith('opencode.json'));
    assert.throws(() => applySetupPlan(plan, { confirm: [entry.path], yes: true }), /--replace-ziki/);
    assert.throws(() => applySetupPlan(plan, { confirm: [], yes: true, replaceZiki: true }), /--confirm/);
    const result = await cmdSetupOpencode(
      { server: 'http://localhost:3001', mcpPath: path.join(home, 'index.js'), apply: true, yes: true, confirm: [entry.path], replaceZiki: true },
      { home, root: CLI_ROOT, asker: null, out: () => {} },
    );
    assert.equal(result.code, 0);
    const merged = JSON.parse(fs.readFileSync(path.join(cfgDir, 'opencode.json'), 'utf8'));
    assert.deepEqual(merged.mcp.ziki.command, ['node', path.join(home, 'index.js')]);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('foreign tools conflict needs replace and skips an identical ziki diff', () => {
  const home = makeHome();
  try {
    const first = buildSetupPlan(baseInput(home));
    applySetupPlan(first, { confirm: [], yes: true });
    const cfgDir = path.join(home, '.config', 'opencode');
    const cfgPath = path.join(cfgDir, 'opencode.json');
    fs.rmSync(path.join(cfgDir, 'skills', 'ziki-work', '.ziki-manifest.json'));
    const edited = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    edited.tools.ziki_ziki_bid = true;
    fs.writeFileSync(cfgPath, JSON.stringify(edited));
    const plan = buildSetupPlan(baseInput(home));
    const entry = plan.files.find((f) => f.path === cfgPath);
    assert.equal(entry.status, 'update');
    assert.equal(entry.reason, 'foreign');
    assert.equal(entry.requiresReplace, true);
    const text = formatPlan(plan);
    assert.ok(!text.includes('"command"'));
    assert.match(text, /\[needs --replace-ziki\]/);
    const written = applySetupPlan(plan, { confirm: [entry.path], yes: true, replaceZiki: true });
    assert.ok(written.includes(entry.path));
    assert.equal(JSON.parse(fs.readFileSync(cfgPath, 'utf8')).tools.ziki_ziki_bid, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('foreign ziki entry in JSONC warns and shows only the entry diff', () => {
  const home = makeHome();
  try {
    const cfgDir = path.join(home, '.config', 'opencode');
    fs.mkdirSync(cfgDir, { recursive: true });
    const jsonc = '{\n  // my theme\n  "mcp": {\n    "ziki": { "type": "local", "command": ["foreign"] },\n  },\n}\n';
    fs.writeFileSync(path.join(cfgDir, 'opencode.jsonc'), jsonc);
    const plan = buildSetupPlan(baseInput(home));
    const entry = plan.files.find((f) => f.path.endsWith('opencode.jsonc'));
    assert.equal(entry.status, 'update');
    assert.equal(entry.reason, 'foreign');
    assert.equal(entry.requiresReplace, true);
    assert.equal(entry.isJsonc, true);
    const text = formatPlan(plan);
    assert.match(text, /comments and formatting in this file will be removed/);
    assert.match(text, /-.*"foreign"/);
    assert.ok(!text.includes('my theme'));
    const written = applySetupPlan(plan, { confirm: [entry.path], yes: true, replaceZiki: true });
    assert.ok(written.includes(entry.path));
    const after = fs.readFileSync(path.join(cfgDir, 'opencode.jsonc'), 'utf8');
    assert.ok(!after.includes('my theme'));
    assert.ok(JSON.parse(after).mcp.ziki);
    const backups = fs.readdirSync(cfgDir).filter((n) => n.startsWith('opencode.jsonc.ziki-backup-'));
    assert.equal(backups.length, 1);
    assert.ok(fs.readFileSync(path.join(cfgDir, backups[0]), 'utf8').includes('my theme'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

