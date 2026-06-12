import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import * as identifyStructure from './tools/identifyStructure.js';
import * as modifyStructure from './tools/modifyStructure.js';
import * as suggestFlowStart from './tools/suggestFlowStart.js';
import * as suggestNextStep from './tools/suggestNextStep.js';
import * as suggestGatewayBranches from './tools/suggestGatewayBranches.js';
import * as suggestBranchStep from './tools/suggestBranchStep.js';
import * as renderDiagram from './tools/renderDiagram.js';
import * as refineDiagram from './tools/refineDiagram.js';
import * as analyzePerval from './tools/analyzePerval.js';

const TOOLS = [
  identifyStructure,
  modifyStructure,
  suggestFlowStart,
  suggestNextStep,
  suggestGatewayBranches,
  suggestBranchStep,
  renderDiagram,
  refineDiagram,
  analyzePerval
];

/** Crea el servidor MCP y registra las herramientas de generación de diagramas BPMN. */
export function createServer() {
  const server = new McpServer({
    name: 'bpmn-assistant',
    version: '1.0.0'
  });

  for (const tool of TOOLS) {
    server.registerTool(tool.name, tool.config, tool.handler);
  }

  return server;
}
