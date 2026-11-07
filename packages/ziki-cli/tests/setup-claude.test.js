import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildClaudePlan, cmdSetupClaude, EXPERIMENTAL_NOTE } from '../src/commands/setup-claude.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function makeHome() {
  const bases = [os.tmpdir(), path.join(HERE, '.tmp')];
  for (const base of bases) {
    try {
      if (base !== os.tmpdir()) fs.mkdirSync(base, { recursive: true });
      return fs.mkdtempSync(path.join(base, `ziki-claude-${process.pid}-`));
    } catch {
      // try the next base
    }
  }
  throw new Error('no writable temp directory');
}

test('plan prints the command and snippet, writes nothing', async () => {
  const home = makeHome();
  try {
    const fakeMcp = path.join(home, 'mcp.cjs');
    fs.writeFileSync(fakeMcp, '// fake');
    const result = await cmdSetupClaude({ server: 'https://ziki.dev', mcpServer: fakeMcp }, { home, root: home });
    assert.equal(result.code, 0);
    assert.ok(result.text.includes(EXPERIMENTAL_NOTE));
    assert.match(result.text, /claude mcp add --transport stdio --scope user ziki/);
    assert.match(result.text, /settings\.json/);
    assert.equal(fs.existsSync(path.join(home, '.claude')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('apply writes settings only and still demands the manual command', async () => {
  const home = makeHome();
  try {
    const fakeMcp = path.join(home, 'mcp.cjs');
    fs.writeFileSync(fakeMcp, '// fake');
    const done = await cmdSetupClaude(
      { apply: true, yes: true, server: 'https://ziki.dev', mcpServer: fakeMcp },
      { home, root: home },
    );
    assert.equal(done.code, 0);
    assert.match(done.text, /run by hand: claude mcp add/);
    const settings = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
    assert.ok(settings.permissions.deny.includes('mcp__ziki__ziki_deliver'));
    assert.equal(settings.permissions.deny.length, 96);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('unparseable settings block with instructions', () => {
  const plan = buildClaudePlan({
    home: 'unused',
    serverUrl: 'https://ziki.dev',
    mcpServerPath: '/x',
    io: { readTarget: () => ({ kind: 'file', text: '{oops' }) },
  });
  assert.equal(plan.files[0].status, 'blocked');
  assert.match(plan.files[0].detail, /by hand/);
});
