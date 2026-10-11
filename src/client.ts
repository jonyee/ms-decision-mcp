import { AzureCliCredential, DefaultAzureCredential } from '@azure/identity';
import { inputSchema, validateOutput, type DecisionInput, type DecisionOutput } from './schema.js';

export interface Config {
  endpoint: string;
  deployment: string;
  auth: 'default' | 'azure-cli' | 'api-key';
  apiKey?: string;
  timeoutMs: number;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const endpoint = env.AZURE_DECISION_ENDPOINT;
  const deployment = env.AZURE_DECISION_DEPLOYMENT;
  if (!endpoint || !deployment?.trim()) throw new Error('Set AZURE_DECISION_ENDPOINT and AZURE_DECISION_DEPLOYMENT');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('AZURE_DECISION_ENDPOINT must be an HTTPS resource base URL without a path or credentials');
  }
  const auth = env.AZURE_DECISION_AUTH ?? (env.AZURE_DECISION_API_KEY ? 'api-key' : 'default');
  if (auth !== 'default' && auth !== 'azure-cli' && auth !== 'api-key') throw new Error('Invalid AZURE_DECISION_AUTH');
  if (auth === 'api-key' && !env.AZURE_DECISION_API_KEY?.trim()) throw new Error('Set AZURE_DECISION_API_KEY for api-key authentication');
  const timeoutMs = Number(env.AZURE_DECISION_TIMEOUT_MS ?? 30000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('Timeout must be 1–300000 milliseconds');
  return { endpoint: url.origin, deployment: deployment.trim(), auth, apiKey: env.AZURE_DECISION_API_KEY, timeoutMs };
}

export class DecisionError extends Error {}
export type Authorize = (signal: AbortSignal) => Promise<Record<string, string>>;

export class DecisionClient {
  private authorize: Authorize;
  constructor(private config: Config, private fetcher: typeof fetch = fetch, authorize?: Authorize) {
    const credential = config.auth === 'azure-cli' ? new AzureCliCredential() : new DefaultAzureCredential();
    this.authorize = authorize ?? (async (signal): Promise<Record<string, string>> => {
      if (config.auth === 'api-key') return { 'api-key': config.apiKey! };
      const token = await credential.getToken('https://cognitiveservices.azure.com/.default', { abortSignal: signal });
      if (!token) throw new DecisionError('Azure authentication returned no token');
      return { Authorization: `Bearer ${token.token}` };
    });
  }

  async decide(value: DecisionInput, cancellation?: AbortSignal): Promise<DecisionOutput> {
    const input = inputSchema.parse(value);
    const body = JSON.stringify({ model: this.config.deployment, ...input });
    if (Buffer.byteLength(body) > 1024 * 1024) throw new DecisionError('Request exceeds the wrapper limit of 1 MiB');
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const signal = cancellation ? AbortSignal.any([timeout, cancellation]) : timeout;
    try {
      const headers = await this.authorize(signal);
      const response = await this.fetcher(`${this.config.endpoint}/providers/microsoft/v1/systemone`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
        body, signal, redirect: 'error',
      });
      if (!response.ok) {
        // Do not echo upstream bodies: they may contain submitted state or sensitive details.
        await response.body?.cancel();
        throw new DecisionError(`Azure Decision API returned HTTP ${response.status}. ${response.status === 429 ? 'Rate limited; retry later.' : 'Check endpoint, deployment, credentials, and permissions.'}`);
      }
      const raw: unknown = await response.json();
      try { return validateOutput(raw, input); }
      catch { throw new DecisionError('Azure returned an invalid decision response'); }
    } catch (error) {
      if (signal.aborted) throw new DecisionError(cancellation?.aborted ? 'Decision request cancelled' : 'Decision request timed out');
      if (error instanceof DecisionError) throw error;
      throw new DecisionError('Decision request failed; check Azure authentication and network connectivity');
    }
  }
}
