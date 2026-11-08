import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cmdInit } from '../src/commands/init.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.join(HERE, '..');
const SERVER = 'http://localhost:3001';
const KEY = 'test-key-never-printed';

function makeHome() {
  const bases = [os.tmpdir(), path.join(HERE, '.tmp')];
  for (const base of bases) {
    try {
      if (base !== os.tmpdir()) {
        fs.mkdirSync(base, { recursive: true });
      }
      return fs.mkdtempSync(path.join(base, `ziki-init-${process.pid}-`));
    } catch {
      // try the next base
    }
  }
  throw new Error('no writable temp directory');
}

function writeKey(home, apiKey = KEY) {
  const file = path.join(home, 'agent.json');
  fs.writeFileSync(file, JSON.stringify({ url: SERVER, apiKey }));
  return file;
}

function writePointer(home, pointer = { projectId: 'p1', projectSlug: 'one', org: 'o', server: SERVER }) {
  fs.writeFileSync(path.join(home, '.ziki.json'), JSON.stringify(pointer));
}

function meFetch(projects) {
  return async () => ({ ok: true, status: 200, json: async () => ({ projects }) });
}

function runInit(home, opts) {
  const lines = [];
  return {
    lines,
    promise: cmdInit({ server: SERVER }, {
      home,
      root: CLI_ROOT,
      cwd: home,
      env: { ...process.env, ZIKI_AGENT_CONFIG: path.join(home, 'agent.json') },
      out: (line) => lines.push(line),
      ...opts,
    }),
  };
}

const ONE = [{ id: 'p1', slug: 'one', name: 'One' }];
const TWO = [...ONE, { id: 'p2', slug: 'two', name: 'Two' }];

test('already paired and linked skips to setup and finishes', async () => {
  const home = makeHome();
  try {
    writeKey(home);
    writePointer(home);
    const setupCalls = [];
    const asker = { confirm: async () => { throw new Error('no ask expected'); }, input: async () => { throw new Error('no input expected'); } };
    const { lines, promise } = runInit(home, {
      asker,
      fetchImpl: meFetch(ONE),
      doLogin: async () => { throw new Error('login must be skipped'); },
      doConnect: async () => { throw new Error('connect must be skipped'); },
      doSetup: async (params, opts) => { setupCalls.push({ params, asker: opts.asker }); return { code: 0, text: 'wrote 5 file(s)\n' }; },
    });
    const result = await promise;
    assert.equal(result.code, 0);
    const text = lines.join('\n');
    assert.match(text, /already paired/);
    assert.match(text, /Already linked to one/);
    assert.match(text, /init done/);
    assert.ok(!text.includes(KEY));
    assert.equal(setupCalls.length, 1);
    assert.deepEqual(Object.keys(setupCalls[0].params), ['server']);
    assert.equal(setupCalls[0].asker, asker);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('login no stops cleanly without pairing', async () => {
  const home = makeHome();
  try {
    let logins = 0;
    const { lines, promise } = runInit(home, {
      asker: { confirm: async () => false, input: async () => '' },
      fetchImpl: meFetch(ONE),
      doLogin: async () => { logins += 1; },
    });
    const result = await promise;
    assert.equal(result.code, 0);
    assert.match(lines.join('\n'), /login skipped; re-run `ziki init`/);
    assert.equal(logins, 0);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('full run pairs, links one project without asking, and finishes', async () => {
  const home = makeHome();
  try {
    const connects = [];
    const { lines, promise } = runInit(home, {
      asker: { confirm: async () => true, input: async () => { throw new Error('no input expected'); } },
      fetchImpl: meFetch(ONE),
      doLogin: async ({ keyFile }) => { fs.writeFileSync(keyFile, JSON.stringify({ url: SERVER, apiKey: 'fresh-key' })); },
      doConnect: async (config, selector, opts) => { connects.push({ selector, force: opts.force }); return { projectId: 'p1', projectSlug: 'one' }; },
      doSetup: async () => ({ code: 0, text: 'wrote 5 file(s)\n' }),
    });
    const result = await promise;
    assert.equal(result.code, 0);
    assert.match(lines.join('\n'), /init done/);
    assert.deepEqual(connects, [{ selector: 'one', force: false }]);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('empty project answer stops without linking', async () => {
  const home = makeHome();
  try {
    writeKey(home);
    let connects = 0;
    const { lines, promise } = runInit(home, {
      asker: { confirm: async () => true, input: async () => '' },
      fetchImpl: meFetch(TWO),
      doConnect: async () => { connects += 1; return {}; },
      doSetup: async () => ({ code: 0, text: '' }),
    });
    const result = await promise;
    assert.equal(result.code, 0);
    assert.match(lines.join('\n'), /no project matching ""/);
    assert.equal(connects, 0);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('project choice by number links that project', async () => {
  const home = makeHome();
  try {
    writeKey(home);
    const connects = [];
    const { promise } = runInit(home, {
      asker: { confirm: async () => true, input: async () => '2' },
      fetchImpl: meFetch(TWO),
      doConnect: async (config, selector, opts) => { connects.push(selector); return { projectId: 'p2', projectSlug: 'two' }; },
      doSetup: async () => ({ code: 0, text: '' }),
    });
    assert.equal((await promise).code, 0);
    assert.deepEqual(connects, ['two']);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('setup failure stops with the step to re-run', async () => {
  const home = makeHome();
  try {
    writeKey(home);
    writePointer(home);
    const { lines, promise } = runInit(home, {
      asker: { confirm: async () => true, input: async () => '' },
      fetchImpl: meFetch(ONE),
      doSetup: async () => ({ code: 1, text: 'boom\n' }),
    });
    const result = await promise;
    assert.equal(result.code, 1);
    assert.match(lines.join('\n'), /setup-opencode failed: boom; re-run `ziki init`/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('login failure stops with the step to re-run', async () => {
  const home = makeHome();
  try {
    const { lines, promise } = runInit(home, {
      asker: { confirm: async () => true, input: async () => '' },
      fetchImpl: meFetch(ONE),
      doLogin: async () => { throw new Error('poll timed out'); },
    });
    const result = await promise;
    assert.equal(result.code, 1);
    assert.match(lines.join('\n'), /login failed: poll timed out/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('non-TTY with many projects stops cleanly', async () => {
  const home = makeHome();
  try {
    writeKey(home);
    const { lines, promise } = runInit(home, {
      asker: null,
      fetchImpl: meFetch(TWO),
      doSetup: async () => ({ code: 0, text: '' }),
    });
    const result = await promise;
    assert.equal(result.code, 0);
    assert.match(lines.join('\n'), /no terminal to choose/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
