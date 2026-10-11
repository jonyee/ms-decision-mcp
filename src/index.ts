#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DecisionClient, loadConfig } from './client.js';
import { createServer } from './server.js';

try {
  const server = createServer(new DecisionClient(loadConfig()));
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Failed to start decision server');
  process.exitCode = 1;
}
