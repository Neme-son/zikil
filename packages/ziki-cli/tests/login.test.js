import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalhost, buildPairArgs } from '../src/commands/login.js';

test('assertLocalhost accepts loopback hosts', () => {
  assert.doesNotThrow(() => assertLocalhost('http://localhost:3001'));
  assert.doesNotThrow(() => assertLocalhost('http://127.0.0.1:3001'));
});

test('assertLocalhost refuses anything else in M1', () => {
  assert.throws(() => assertLocalhost('https://ziki.dev'), /localhost only/);
  assert.throws(() => assertLocalhost('http://192.168.1.5:3001'), /localhost only/);
  assert.throws(() => assertLocalhost('not-a-url'), /localhost only/);
});

test('buildPairArgs shells out to the reference client, never reimplements pairing', () => {
  const args = buildPairArgs({ server: 'http://localhost:3001', name: 'scout', open: false });
  assert.deepEqual(args, ['pair', '--url', 'http://localhost:3001', '--name', 'scout', '--no-open']);
});
