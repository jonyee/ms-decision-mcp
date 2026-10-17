import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DecisionClient, loadConfig, type Config } from '../src/client.js';
import { inputSchema, validateOutput, type DecisionInput } from '../src/schema.js';
import { createServer } from '../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const config: Config = { endpoint: 'https://example.services.ai.azure.com', deployment: 'test-decision', auth: 'api-key', apiKey: 'test-key', timeoutMs: 1000 };
const input: DecisionInput = { state: 'Checkout is down.', questions: {
  outage: { type: 'noul', instructions: 'Is this an outage?' },
  team: { type: 'choice', instructions: 'Which team?', criteria: { engineering: 'Outages', billing: 'Invoices' } },
  severity: { type: 'score', instructions: 'Severity?', criteria: ['Minor', 'Major'] },
} };
const output = { model: 'microsoft-decision-1', answers: {
  outage: { type: 'noul', noul: 0.99 },
  team: { type: 'choice', choice: 'engineering', probabilities: { engineering: 0.9, billing: 0.1 }, confidence: 0.8 },
  severity: { type: 'score', score: 0.9, probabilities: { '0': 0.1, '1': 0.9 }, legend: { '0': 'Minor', '1': 'Major' }, confidence: 0.8 },
}, usage: { input_tokens: 100, output_tokens: 3 } };
const mock = (handler: (init?: RequestInit) => Response | Promise<Response>) => ((_: unknown, init?: RequestInit) => handler(init)) as typeof fetch;

test('configuration validates endpoint, auth and timeout', () => {
  const env = { AZURE_DECISION_ENDPOINT: config.endpoint, AZURE_DECISION_DEPLOYMENT: config.deployment };
  assert.equal(loadConfig(env).auth, 'default');
  assert.equal(loadConfig({ ...env, AZURE_DECISION_AUTH: 'azure-cli' }).auth, 'azure-cli');
  assert.throws(() => loadConfig({}));
  for (const endpoint of ['http://example.com', 'https://user:password@example.com', 'https://example.com/path']) {
    assert.throws(() => loadConfig({ ...env, AZURE_DECISION_ENDPOINT: endpoint }));
  }
  assert.throws(() => loadConfig({ ...env, AZURE_DECISION_AUTH: 'api-key' }));
  assert.throws(() => loadConfig({ ...env, AZURE_DECISION_TIMEOUT_MS: 'NaN' }));
});

test('rejects malformed questions and JSON state', () => {
  assert.throws(() => inputSchema.parse({ state: '', questions: {} }));
  assert.throws(() => inputSchema.parse({ state: 'test', questions: { x: { type: 'choice', instructions: 'Pick', criteria: ['a', 'b'] } } }));
  assert.throws(() => inputSchema.parse({ state: { bad: undefined }, questions: input.questions }));
  assert.throws(() => inputSchema.parse({ ...input, questions: { x: { type: 'score', instructions: 'Rate', criteria: ['one'] } } }));
});

test('validates matching question IDs, types, labels, probabilities and rubrics', () => {
  assert.equal(validateOutput(output, input).model, output.model);
  const mutate = (fn: (value: typeof output) => void) => { const copy = structuredClone(output); fn(copy); assert.throws(() => validateOutput(copy, input)); };
  mutate(v => { v.answers.outage.noul = 1.1; });
  mutate(v => { v.answers.team.choice = 'unknown'; });
  mutate(v => { v.answers.team.probabilities.engineering = 0.1; });
  mutate(v => { v.answers.severity.score = 2; });
  mutate(v => { v.answers.severity.legend['1'] = 'Critical'; });
  assert.throws(() => validateOutput({ ...output, answers: {} }, input));
  assert.throws(() => validateOutput({ ...output, answers: { ...output.answers, team: output.answers.outage } }, input));
});

test('posts deployment and typed questions to Azure provider route', async () => {
  let called = false;
  const fetcher: typeof fetch = async (url, init) => {
    called = true;
    assert.equal(url, `${config.endpoint}/providers/microsoft/v1/systemone`);
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('api-key'), 'test-key');
    assert.deepEqual(JSON.parse(init?.body as string), { model: config.deployment, ...input });
    assert.equal(init?.redirect, 'error');
    return Response.json(output);
  };
  assert.deepEqual(await new DecisionClient(config, fetcher).decide(input), output);
  assert.ok(called);
});

test('does not echo HTTP error bodies or credentials and does not retry', async () => {
  let calls = 0;
  const client = new DecisionClient(config, mock(() => { calls++; return new Response('secret upstream state test-key', { status: 429 }); }));
  await assert.rejects(client.decide(input), /^Error: Azure Decision API returned HTTP 429/);
  assert.equal(calls, 1);
});

test('rejects malformed response JSON and schema', async () => {
  await assert.rejects(new DecisionClient(config, mock(() => Response.json({ answers: {} }))).decide(input), /invalid decision response/);
  await assert.rejects(new DecisionClient(config, mock(() => new Response('not json'))).decide(input), /request failed/);
});

test('timeout and cancellation propagate', async () => {
  const fetcher = mock(init => new Promise((_, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('abort')), { once: true });
  }));
  // Keep the event loop alive: AbortSignal.timeout uses an unref timer.
  const keepAlive = setInterval(() => {}, 100);
  try {
    await assert.rejects(new DecisionClient({ ...config, timeoutMs: 10 }, fetcher).decide(input), /timed out/);
    const controller = new AbortController();
    const pending = new DecisionClient(config, fetcher).decide(input, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(pending, /cancelled/);
  } finally { clearInterval(keepAlive); }
});

test('MCP lists typed tool and returns structured answers and tool errors', async () => {
  let fail = false;
  const server = createServer(new DecisionClient(config, mock(() => fail ? new Response('', { status: 403 }) : Response.json(output))));
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(client.getServerVersion()?.version, pkg.version);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 1);
    assert.equal(tools[0]?.name, 'decide');
    assert.ok(tools[0]?.outputSchema);
    const result = await client.callTool({ name: 'decide', arguments: input });
    assert.deepEqual(result.structuredContent, output);
    fail = true;
    const error = await client.callTool({ name: 'decide', arguments: input });
    assert.equal(error.isError, true);
  } finally { await client.close(); await server.close(); }
});
