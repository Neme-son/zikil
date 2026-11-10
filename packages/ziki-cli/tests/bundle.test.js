import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIN_BUNDLE_BYTES, bundlePath, bundleSize, bundleSane, removeBundle, buildCommand } from '../scripts/bundle-mcp.mjs';

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

test('bundle helpers measure, judge and remove the bundle', () => {
  const root = makeTemp('ziki-cli-bundle');
  try {
    assert.equal(bundleSize(root), -1);
    assert.equal(bundleSane(root), false);
    fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
    fs.writeFileSync(bundlePath(root), 'tiny');
    assert.equal(bundleSize(root), 4);
    assert.equal(bundleSane(root), false);
    fs.writeFileSync(bundlePath(root), Buffer.alloc(MIN_BUNDLE_BYTES));
    assert.equal(bundleSane(root), true);
    removeBundle(root);
    assert.equal(fs.existsSync(path.join(root, 'vendor')), false);
    assert.equal(bundleSize(root), -1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('build command bundles the mcp server entry into vendor', () => {
  const cmd = buildCommand('/pkg');
  assert.match(cmd, /esbuild@0\.28\.2/);
  assert.match(cmd, /\.\.\/mcp-server\/src\/index\.ts/);
  assert.ok(cmd.includes(`--outfile="${path.join('/pkg', 'vendor', 'mcp-server.cjs')}"`));
  assert.match(cmd, /--bundle/);
});

test('default tarball includes the vendor bundle, package stays private', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('vendor'));
  assert.equal(pkg.private, true);
  assert.ok(typeof pkg.scripts.prepack === 'string');
  assert.ok(typeof pkg.scripts.prepublishOnly === 'string');
});
