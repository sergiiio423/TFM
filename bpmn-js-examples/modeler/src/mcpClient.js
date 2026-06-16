import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// ─── CLIENTE MCP (NAVEGADOR) ──────────────────────────────────────────────────
// El frontend actúa como host/cliente MCP: las herramientas de generación de
// diagramas (LLM, prompts, render BPMN...) viven en el servidor MCP
// (mcp-server/), al que se llega vía /mcp (proxied por webpack-dev-server).

let clientPromise = null;

// MCP_SERVER_URL la define webpack.DefinePlugin en tiempo de build (ver
// webpack.config.cjs). En local queda vacía y se usa el proxy /mcp de
// webpack-dev-server; en producción apunta a la URL pública del servidor
// MCP desplegado (otro origen, p.ej. https://tfm-bpmn-mcp-server.onrender.com).
const MCP_BASE = MCP_SERVER_URL || window.location.origin;

function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client({ name: 'bpmn-modeler-web', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL('/mcp', MCP_BASE));
      await client.connect(transport);
      return client;
    })().catch(err => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

/**
 * Llama a una herramienta del servidor MCP y devuelve su "structuredContent".
 * Si la herramienta falla, lanza un Error con el mensaje (ya traducido por el
 * servidor) listo para mostrar al usuario.
 */
export async function callTool(name, args) {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });
  if (result.isError) {
    throw new Error(result.content?.[0]?.text || 'Error MCP desconocido');
  }
  return result.structuredContent;
}
