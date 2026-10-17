import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('release metadata and pinned installation examples match the package version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../.release-please-manifest.json', import.meta.url), 'utf8'));
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.equal(pkg.name, '@jonathanyee/ms-decision-mcp');
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].name, pkg.name);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(manifest['.'], pkg.version);
  assert.equal(pkg.bin['ms-decision-mcp'], 'dist/index.js');

  const examples = [...readme.matchAll(/@jonathanyee\/ms-decision-mcp@([^\s`"]+)/g)];
  assert.ok(examples.length > 0);
  for (const [, version] of examples) assert.equal(version, pkg.version);
  assert.ok(readme.includes(`jonathanyee-ms-decision-mcp-${pkg.version}.tgz`));
});
