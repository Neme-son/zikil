import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { classifyFile, applyPlan } from '../src/setup/plan.js';

test('absent file plans as create without confirmation', () => {
  const entry = classifyFile({ kind: 'absent' }, 'desired', null);
  assert.deepEqual(entry, { status: 'create', reason: null, requiresConfirmation: false });
});

test('identical file plans as unchanged', () => {
  const entry = classifyFile({ kind: 'file', text: 'same' }, 'same', null);
  assert.equal(entry.status, 'unchanged');
});

test('managed file with moved template plans as generated update', () => {
  const recorded = `sha256:${crypto.createHash('sha256').update('old-managed', 'utf8').digest('hex')}`;
  const entry = classifyFile({ kind: 'file', text: 'old-managed' }, 'new-template', recorded);
  assert.equal(entry.status, 'update');
  assert.equal(entry.reason, 'generated');
  assert.equal(entry.requiresConfirmation, true);
});

test('apply refuses unwritten confirmations and writes nothing', () => {
  const writes = [];
  const plan = {
    files: [
      {
        path: 'a.json',
        absolutePath: '/tmp/a.json',
        status: 'update',
        reason: 'unverified',
        requiresConfirmation: true,
        desiredText: 'x',
      },
    ],
  };
  assert.throws(() => applyPlan(plan, { confirm: [], io: { writeFile: (p) => writes.push(p) } }), /--confirm/);
  assert.deepEqual(writes, []);
});

test('apply refuses replace entries without replace approval, writes with it', () => {
  const writes = [];
  const io = { writeFile: (p) => writes.push(p) };
  const plan = {
    files: [
      {
        path: 'opencode.json',
        absolutePath: '/tmp/opencode.json',
        status: 'update',
        reason: 'foreign',
        requiresConfirmation: true,
        requiresReplace: true,
        desiredText: 'x',
      },
    ],
  };
  assert.throws(() => applyPlan(plan, { confirm: ['opencode.json'], io }), /replace approval/);
  assert.deepEqual(writes, []);
  const written = applyPlan(plan, { confirm: ['opencode.json'], io, replaceOwned: true });
  assert.deepEqual(written, ['opencode.json']);
  assert.deepEqual(writes, ['/tmp/opencode.json']);
});
