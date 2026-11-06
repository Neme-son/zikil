import test from 'node:test';
import assert from 'node:assert/strict';
import { runDoctor } from '../src/commands/doctor.js';

function fakeEnv(overrides = {}) {
  return {
    nodeVersion: 'v24.16.0',
    pairingFile: { exists: true, mode: 0o600 },
    platform: 'linux',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }),
    serverUrl: 'http://localhost:3001',
    opencodeConfig: { exists: true, path: '/home/u/.config/opencode/opencode.json' },
    ...overrides,
  };
}

test('doctor reports healthy when everything is present', async () => {
  const report = await runDoctor(fakeEnv());
  assert.equal(report.ok, true);
  assert.equal(report.checks.every((c) => c.ok), true);
});

test('doctor fails when the pairing file is missing', async () => {
  const report = await runDoctor(fakeEnv({ pairingFile: { exists: false } }));
  assert.equal(report.ok, false);
  assert.match(report.checks.find((c) => c.name === 'pairing').detail, /not found/);
});

test('doctor fails when the server is unreachable', async () => {
  const report = await runDoctor(
    fakeEnv({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }),
  );
  assert.equal(report.ok, false);
  assert.equal(report.checks.find((c) => c.name === 'server').ok, false);
});

test('doctor warns (not fails) when opencode config is absent', async () => {
  const report = await runDoctor(fakeEnv({ opencodeConfig: { exists: false } }));
  const check = report.checks.find((c) => c.name === 'opencode');
  assert.equal(check.ok, true);
  assert.equal(check.warning, true);
});
