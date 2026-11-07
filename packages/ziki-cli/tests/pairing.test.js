import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairAgent, buildPairStartBody, buildTokenBody, saveKeyFile, TOKEN_ROUTES } from '../src/pairing.js';
import { pair as referencePair } from '../../../scripts/ziki-agent.mjs';

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

test('pairing hits the same routes as the reference client', () => {
  assert.equal(TOKEN_ROUTES.start, '/api/v1/agents/pairing');
  assert.equal(TOKEN_ROUTES.token, '/api/v1/agents/pairing/token');
  assert.equal(TOKEN_ROUTES.me, '/api/v1/agents/me');
});

test('start body requires a name and passes model/level through', () => {
  assert.deepEqual(buildPairStartBody({ name: 'a' }), { name: 'a' });
  assert.deepEqual(buildPairStartBody({ name: 'a', model: 'm', level: 'working' }), {
    name: 'a', model: 'm', level: 'working',
  });
  assert.throws(() => buildPairStartBody({}), /--name is required/);
  assert.deepEqual(buildTokenBody('d'), { device_code: 'd' });
});

function scriptedServer(script) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    requests.push({ url: String(url), body });
    const next = script[Math.min(requests.length - 1, script.length - 1)];
    if (next instanceof Error) throw next;
    return { ok: next.status < 400, status: next.status, json: async () => next.json };
  };
  return { requests, fetchImpl };
}

const START = {
  status: 200,
  json: {
    device_code: 'device-123',
    user_code: 'AB12-CD34',
    verification_uri_complete: 'https://ziki.dev/pair?code=AB12-CD34',
    expires_at: new Date(Date.now() + 600000).toISOString(),
    interval: 1,
  },
};
const ISSUED = {
  status: 200,
  json: { api_key: 'k', agent: { id: 'a1', name: 'scout' } },
};
const ME = { status: 200, json: { username: 'scout' } };

test('full flow: start, pending, issued, saved, identity confirmed', async () => {
  const dir = makeTemp('ziki-cli-pair');
  const keyFile = path.join(dir, 'agent.json');
  const { requests, fetchImpl } = scriptedServer([
    START,
    { status: 200, json: { error: 'authorization_pending' } },
    ISSUED,
    ME,
  ]);
  const lines = [];
  const record = await pairAgent(
    { server: 'https://ziki.dev', name: 'scout', open: false, keyFile },
    { fetchImpl, sleep: async () => {}, out: (l) => lines.push(l) },
  );
  assert.equal(record.apiKey, 'k');
  assert.equal(record.agentId, 'a1');
  const saved = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  assert.equal(saved.apiKey, 'k');
  assert.equal(saved.url, 'https://ziki.dev');
  assert.ok(lines.join('\n').includes('AB12-CD34'));
  assert.ok(lines.join('\n').includes('scout'));
  assert.deepEqual(
    requests.map((r) => r.url),
    [
      'https://ziki.dev/api/v1/agents/pairing',
      'https://ziki.dev/api/v1/agents/pairing/token',
      'https://ziki.dev/api/v1/agents/pairing/token',
      'https://ziki.dev/api/v1/agents/me',
    ],
  );
  assert.deepEqual(requests[0].body, { name: 'scout' });
  assert.deepEqual(requests[1].body, { device_code: 'device-123' });
  fs.rmSync(dir, { recursive: true, force: true });
});

// The vendored flow must stay protocol-identical to scripts/ziki-agent.mjs:
// same request sequence against the same scripted server.
test('conformance: identical requests to the reference client', async () => {
  const script = [START, { status: 200, json: { error: 'authorization_pending' } }, ISSUED, ME];
  const ours = scriptedServer(script);
  const dir = makeTemp('ziki-cli-pair');
  await pairAgent(
    { server: 'https://ziki.dev', name: 'scout', open: false, keyFile: path.join(dir, 'a.json') },
    { fetchImpl: ours.fetchImpl, sleep: async () => {}, out: () => {} },
  );
  const theirs = scriptedServer(script);
  const refDir = makeTemp('ziki-ref-pair');
  await referencePair(
    {
      fetch: theirs.fetchImpl,
      sleep: async () => {},
      now: () => Date.now(),
      log: () => {},
      out: () => {},
      openUrl: () => {},
      env: {},
    },
    { name: 'scout', url: 'https://ziki.dev', open: false, configFile: path.join(refDir, 'agent.json') },
  );
  assert.deepEqual(
    ours.requests.map((r) => [r.url, r.body]),
    theirs.requests.map((r) => [r.url.replace(/\/$/, ''), r.body]),
  );
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(refDir, { recursive: true, force: true });
});

test('expired and used codes fail loudly; network blips keep polling', async () => {
  const dir = makeTemp('ziki-cli-pair');
  const run = (script) =>
    pairAgent(
      { server: 'https://ziki.dev', name: 's', open: false, keyFile: path.join(dir, 'a.json') },
      { fetchImpl: scriptedServer(script).fetchImpl, sleep: async () => {}, out: () => {} },
    ).then(
      (record) => record,
      (e) => e.message,
    );
  assert.match(await run([START, { status: 400, json: { error: 'expired_token' } }]), /expired/);
  assert.match(await run([START, { status: 400, json: { error: 'used_token' } }]), /already collected/);
  assert.match(await run([{ status: 500, json: { error: 'x' } }]), /pairing start failed/);
  const ok = await run([START, new Error('boom'), ISSUED, ME]);
  assert.equal(ok.apiKey, 'k');
  fs.rmSync(dir, { recursive: true, force: true });
});
