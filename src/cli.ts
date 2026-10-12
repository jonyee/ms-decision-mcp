import { parseArgs } from 'node:util';
import { loadConfig, type Config } from './client.js';

export const help = `Usage: ms-decision-mcp [options]

Run the Microsoft-Decision-1 MCP server over stdio.
Command-line settings override environment settings.

Options:
  --endpoint <url>         HTTPS Azure resource base URL
                          (AZURE_DECISION_ENDPOINT)
  --deployment <name>      Azure deployment name (AZURE_DECISION_DEPLOYMENT)
  --auth <mode>           default, azure-cli, or api-key (AZURE_DECISION_AUTH)
  --timeout-ms <number>   Request timeout, 1–300000; default 30000
                          (AZURE_DECISION_TIMEOUT_MS)
  -h, --help              Show this help without starting the server

API keys must be supplied through AZURE_DECISION_API_KEY, not arguments.
Help and startup errors go to stderr; stdout is reserved for MCP.
`;

export function parseCli(args: string[], env: NodeJS.ProcessEnv = process.env): Config | undefined {
  let values;
  try {
    ({ values } = parseArgs({
      args, strict: true, allowPositionals: false,
      options: {
        endpoint: { type: 'string' },
        deployment: { type: 'string' },
        auth: { type: 'string' },
        'timeout-ms': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch {
    // Avoid echoing argument values, which might contain credentials supplied by mistake.
    throw new Error('Invalid command-line arguments. Use --help for supported options.');
  }
  if (values.help) return undefined;
  return loadConfig({
    ...env,
    ...(values.endpoint !== undefined ? { AZURE_DECISION_ENDPOINT: values.endpoint } : {}),
    ...(values.deployment !== undefined ? { AZURE_DECISION_DEPLOYMENT: values.deployment } : {}),
    ...(values.auth !== undefined ? { AZURE_DECISION_AUTH: values.auth } : {}),
    ...(values['timeout-ms'] !== undefined ? { AZURE_DECISION_TIMEOUT_MS: values['timeout-ms'] } : {}),
  });
}
