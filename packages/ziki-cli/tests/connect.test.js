import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectProject } from '../src/commands/connect.js';

// os.tmpdir() may be unwritable (sandboxed users); fall back to a cleaned-up
// directory next to the tests.
function makeTempDir() {
  const prefix = `ziki-connect-${process.pid}-`;
  const fallback = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp');
  for (const base of [os.tmpdir(), fallback]) {
    try {
      if (base !== os.tmpdir()) {
        fs.mkdirSync(base, { recursive: true });
      }
      return fs.mkdtempSync(path.join(base, prefix));
    } catch {
      // try the next base
    }
  }
  throw new Error('no writable temp directory');
}

function fakeFetch(me) {
  return async (url) => {
    assert.match(url, /\/api\/v1\/agents\/me$/);
    return { ok: true, status: 200, json: async () => me };
  };
}

const ME = {
  org_slug: 'demo',
  projects: [
    { id: 'p1', slug: 'demo', name: 'Demo' },
    { id: 'p2', slug: 'other', name: 'Other' },
  ],
};

test('connect resolves a project slug and writes .ziki.json', async () => {
  const dir = makeTempDir();
  const pointer = await connectProject(
    { url: 'http://localhost:3001', apiKey: 'K' },
    'demo',
    { cwd: dir, fetchImpl: fakeFetch(ME), force: false },
  );
  assert.deepEqual(pointer, { projectId: 'p1', projectSlug: 'demo', org: 'demo', server: 'http://localhost:3001' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.ziki.json'), 'utf8')), pointer);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('connect resolves by id and refuses unknown projects', async () => {
  const dir = makeTempDir();
  await assert.rejects(
    connectProject({ url: 'http://localhost:3001', apiKey: 'K' }, 'nope', {
      cwd: dir,
      fetchImpl: fakeFetch(ME),
      force: false,
    }),
    /no project/i,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('connect refuses to overwrite a different pointer without --force', async () => {
  const dir = makeTempDir();
  fs.writeFileSync(path.join(dir, '.ziki.json'), JSON.stringify({ projectId: 'p2' }));
  await assert.rejects(
    connectProject({ url: 'http://localhost:3001', apiKey: 'K' }, 'demo', {
      cwd: dir,
      fetchImpl: fakeFetch(ME),
      force: false,
    }),
    /force/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
