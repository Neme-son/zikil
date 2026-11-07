import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pickWorkProject, cmdWork } from '../src/commands/work.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function makeTemp(prefix) {
  const bases = [os.tmpdir(), path.join(HERE, '.tmp')];
  for (const base of bases) {
    try {
      if (base !== os.tmpdir()) fs.mkdirSync(base, { recursive: true });
      return fs.mkdtempSync(path.join(base, `${prefix}-${process.pid}-`));
    } catch {
      // try the next base
    }
  }
  throw new Error('no writable temp directory');
}

const ME = {
  projects: [
    { id: 'p1', slug: 'alpha', workUrl: 'https://ziki.dev/o/alpha/work' },
    { id: 'p2', slug: 'beta', workUrl: 'https://ziki.dev/o/beta/work' },
  ],
};

test('explicit project wins by slug or id', () => {
  assert.equal(pickWorkProject(ME, { project: 'beta' }).id, 'p2');
  assert.equal(pickWorkProject(ME, { project: 'p1' }).slug, 'alpha');
});

test('unknown project is an error naming the project', () => {
  assert.throws(() => pickWorkProject(ME, { project: 'nope' }), /no project "nope"/);
});

test('connect pointer picks the project, first wins without one', () => {
  assert.equal(pickWorkProject(ME, { pointer: { projectSlug: 'beta' } }).id, 'p2');
  assert.equal(pickWorkProject(ME, { pointer: { projectId: 'p1' } }).slug, 'alpha');
  assert.equal(pickWorkProject(ME, {}).id, 'p1');
});

test('a stale pointer falls through to the first project', () => {
  assert.equal(pickWorkProject(ME, { pointer: { projectSlug: 'gone' } }).id, 'p1');
});

test('no projects on the key is an error', () => {
  assert.throws(() => pickWorkProject({ projects: [] }, {}), /no projects/);
});

test('cmdWork follows the picked workUrl and prints the feed', async () => {
  const dir = makeTemp('ziki-cli-work');
  const keyFile = path.join(dir, 'agent.json');
  fs.writeFileSync(keyFile, JSON.stringify({ url: 'https://ziki.dev', apiKey: 'k' }));
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/api/v1/agents/me')) {
      return { ok: true, status: 200, json: async () => ME };
    }
    return { ok: true, status: 200, json: async () => ({ items: [{ kind: 'bid' }] }) };
  };
  const first = await cmdWork({ keyFile, cwd: dir }, { fetchImpl });
  assert.equal(first.code, 0);
  assert.match(first.text, /"kind": "bid"/);
  assert.ok(calls.includes('https://ziki.dev/o/alpha/work'));
  fs.writeFileSync(path.join(dir, '.ziki.json'), JSON.stringify({ projectSlug: 'beta' }));
  const second = await cmdWork({ keyFile, cwd: dir }, { fetchImpl });
  assert.equal(second.code, 0);
  assert.ok(calls.includes('https://ziki.dev/o/beta/work'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cmdWork without a key file fails before any fetch', async () => {
  const calls = [];
  const result = await cmdWork(
    { keyFile: 'nonexistent.json', cwd: 'nonexistent-dir' },
    { fetchImpl: async () => { calls.push(1); throw new Error('must not fetch'); } },
  ).catch((e) => e);
  assert.ok(result instanceof Error);
  assert.match(result.message, /pairing file not found/);
  assert.deepEqual(calls, []);
});
