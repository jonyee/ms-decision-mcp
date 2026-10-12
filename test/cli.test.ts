import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseCli } from '../src/cli.js';

const env = {
  AZURE_DECISION_ENDPOINT: 'https://example.services.ai.azure.com',
  AZURE_DECISION_DEPLOYMENT: 'env-deployment',
  AZURE_DECISION_AUTH: 'default',
  AZURE_DECISION_TIMEOUT_MS: '30000',
};

test('CLI overrides environment settings without mutating them', () => {
  const config = parseCli([
    '--endpoint=https://other.services.ai.azure.com', '--deployment', 'cli-deployment',
    '--auth', 'azure-cli', '--timeout-ms', '1234',
  ], env);
  assert.deepEqual(config, {
    endpoint: 'https://other.services.ai.azure.com', deployment: 'cli-deployment',
    auth: 'azure-cli', timeoutMs: 1234, apiKey: undefined,
  });
  assert.equal(env.AZURE_DECISION_DEPLOYMENT, 'env-deployment');
});

test('CLI falls back to environment and supports fully argument-based nonsecret config', () => {
  assert.equal(parseCli([], env)?.deployment, 'env-deployment');
  const config = parseCli(['--endpoint', env.AZURE_DECISION_ENDPOINT, '--deployment', 'test'], {});
  assert.equal(config?.auth, 'default');
  assert.equal(config?.timeoutMs, 30000);
  assert.equal(parseCli(['--auth', 'api-key'], { ...env, AZURE_DECISION_API_KEY: 'test-key' })?.apiKey, 'test-key');
});

test('help needs no settings; malformed arguments and invalid settings are rejected', () => {
  assert.equal(parseCli(['--help'], {}), undefined);
  assert.equal(parseCli(['-h'], {}), undefined);
  for (const args of [['--endpoint'], ['--unknown'], ['positional'], ['--api-key', 'secret']]) {
    assert.throws(() => parseCli(args, env), /Invalid command-line arguments/);
  }
  assert.throws(() => parseCli(['--auth', 'wrong'], env), /Invalid AZURE_DECISION_AUTH/);
  assert.throws(() => parseCli(['--timeout-ms', '0'], env), /Timeout/);
  assert.throws(() => parseCli(['--endpoint', 'http://example.com'], env), /HTTPS/);
  assert.throws(() => parseCli(['--deployment='], env), /Set AZURE_DECISION/);
  assert.throws(() => parseCli(['--auth', 'api-key'], env), /API_KEY/);
});

test('entry point prints help only to stderr and exits successfully', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts', '--help'], {
    encoding: 'utf8', env: { ...process.env, AZURE_DECISION_ENDPOINT: '', AZURE_DECISION_DEPLOYMENT: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Usage: ms-decision-mcp/);
});
