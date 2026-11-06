import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkArgs } from '../src/commands/work.js';

test('work delegates to the reference client default path', () => {
  assert.deepEqual(buildWorkArgs({}), ['work']);
});

test('work never passes --project (reference explicit-project URL predates org routes)', () => {
  assert.throws(() => buildWorkArgs({ project: 'demo' }), /not supported in M1/);
});
