import test from 'node:test';
import assert from 'node:assert/strict';
import { assertServerRule, resolveServer, DEFAULT_SERVER } from '../src/commands/login.js';

test('server rule allows https anywhere and http on loopback', () => {
  assert.equal(assertServerRule('https://ziki.dev'), 'https://ziki.dev');
  assert.equal(assertServerRule('http://localhost:3001'), 'http://localhost:3001');
  assert.equal(assertServerRule('http://127.0.0.1:3001/'), 'http://127.0.0.1:3001');
});

test('server rule refuses plain http off localhost and bad URLs', () => {
  assert.throws(() => assertServerRule('http://192.168.1.5:3001'), /plain http/);
  assert.throws(() => assertServerRule('not-a-url'), /not a URL/);
  assert.throws(() => assertServerRule('ftp://example.com'), /unsupported protocol/);
});

test('default server is hosted Ziki; flag beats env beats default', () => {
  assert.equal(DEFAULT_SERVER, 'https://ziki.dev');
  assert.equal(resolveServer({}), 'https://ziki.dev');
  assert.equal(resolveServer({ env: { ZIKI_URL: 'http://localhost:3001' } }), 'http://localhost:3001');
  assert.equal(
    resolveServer({ server: 'https://ziki.dev', env: { ZIKI_URL: 'http://localhost:3001' } }),
    'https://ziki.dev',
  );
});
