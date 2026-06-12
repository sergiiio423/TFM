import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './registerTools.js';

/**
 * Arranca el servidor MCP sobre stdio, para hosts tipo Claude Desktop/Claude Code.
 */
export async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
