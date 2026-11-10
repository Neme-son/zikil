import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYes, planQuestion, defaultAsker } from '../src/setup/ask.js';

test('parseYes accepts only explicit yes', () => {
  assert.equal(parseYes('y'), true);
  assert.equal(parseYes('yes'), true);
  assert.equal(parseYes(' Y '), true);
  assert.equal(parseYes('YES'), true);
  assert.equal(parseYes(''), false);
  assert.equal(parseYes('n'), false);
  assert.equal(parseYes('no'), false);
  assert.equal(parseYes('yep'), false);
  assert.equal(parseYes(null), false);
  assert.equal(parseYes(undefined), false);
});

test('planQuestion is plain without JSONC, names the file with it', () => {
  assert.equal(planQuestion({ files: [{ path: '/a', status: 'create' }] }), 'Apply these changes? [y/N] ');
  const q = planQuestion({ files: [{ path: '/c/opencode.json', status: 'update', reason: 'jsonc' }] });
  assert.match(q, /\/c\/opencode\.json/);
  assert.match(q, /backup is made/);
  assert.match(q, /Apply these changes\? \[y\/N\] $/);
});

test('defaultAsker is null without a TTY', () => {
  assert.equal(defaultAsker({ stdin: {}, stdout: {} }), null);
});
