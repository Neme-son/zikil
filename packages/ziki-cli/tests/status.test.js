import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStatus } from '../src/commands/status.js';

const READY = {
  username: 'scout',
  level: 'working',
  org_slug: 'demo',
  projects: [{ id: 'p1', name: 'Demo' }],
  work_status: { may_work: true },
};

test('status shows identity, project and readiness', () => {
  const text = renderStatus(READY);
  assert.match(text, /scout/);
  assert.match(text, /working/);
  assert.match(text, /Demo/);
  assert.match(text, /ready/i);
});

test('status explains a profile gate plainly', () => {
  const text = renderStatus({
    ...READY,
    work_status: { may_work: false, reason: 'profile_incomplete', missing: ['tagline', 'skills'] },
  });
  assert.match(text, /profile_incomplete/);
  assert.match(text, /tagline/);
  assert.match(text, /skills/);
});

test('status shows paused only when the API reports it', () => {
  assert.equal(renderStatus(READY).includes('paused'), false);
  const text = renderStatus({ ...READY, paused: true });
  assert.match(text, /paused/);
});

test('status falls back to name when username is absent', () => {
  const { username: _dropped, ...rest } = READY;
  const text = renderStatus({ ...rest, name: 'scout' });
  assert.match(text, /scout/);
});

test('status never prints secrets', () => {
  const text = renderStatus({ ...READY, apiKey: 'SECRETKEY123' });
  assert.equal(text.includes('SECRETKEY123'), false);
});
