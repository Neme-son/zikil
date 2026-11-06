import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { resolveConfigPath, loadConfig, summarizeConfig, apiFetch } from '../src/config/store.js';

test('resolveConfigPath honors ZIKI_AGENT_CONFIG override', () => {
  const p = resolveConfigPath({ ZIKI_AGENT_CONFIG: '/tmp/custom-agent.json' });
  assert.equal(p, '/tmp/custom-agent.json');
});

test('resolveConfigPath defaults to ~/.config/ziki/agent.json', () => {
  const p = resolveConfigPath({});
  assert.equal(p, path.join(os.homedir(), '.config', 'ziki', 'agent.json'));
});

test('loadConfig reports a missing file without throwing a raw error', () => {
  const missing = path.join(os.tmpdir(), `ziki-missing-${process.pid}.json`);
  assert.throws(() => loadConfig(missing), /pairing file not found/);
});

test('summarizeConfig never contains the key', () => {
  const summary = summarizeConfig({ url: 'http://localhost:3001', apiKey: 'SECRETKEY123' });
  assert.equal(summary.hasKey, true);
  assert.equal(JSON.stringify(summary).includes('SECRETKEY123'), false);
});

test('apiFetch sends the key as a Bearer token', async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const config = { url: 'http://localhost:3001', apiKey: 'K' };
  await apiFetch(config, '/api/v1/agents/me', { fetchImpl: fakeFetch });
  assert.equal(seen.url, 'http://localhost:3001/api/v1/agents/me');
  assert.equal(seen.init.headers.Authorization, 'Bearer K');
});
