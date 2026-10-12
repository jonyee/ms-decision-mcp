#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DecisionClient } from './client.js';
import { help, parseCli } from './cli.js';
import { createServer } from './server.js';

try {
  const config = parseCli(process.argv.slice(2));
  if (!config) {
    console.error(help);
  } else {
    const server = createServer(new DecisionClient(config));
    await server.connect(new StdioServerTransport());
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Failed to start decision server');
  process.exitCode = 1;
}
