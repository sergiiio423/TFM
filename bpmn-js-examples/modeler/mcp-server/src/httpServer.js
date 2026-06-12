import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './registerTools.js';

/**
 * Servidor HTTP del MCP, en modo "stateless": cada petición crea su propia
 * instancia de servidor + transporte (no hay sesiones entre peticiones), lo
 * que simplifica el host (cliente MCP del navegador) y evita gestionar el
 * ciclo de vida de sesiones para este prototipo.
 */
export function startHttpServer(port) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/mcp', async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('Error en el servidor MCP:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  const methodNotAllowed = (req, res) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  };
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  app.listen(port, () => {
    console.log(`Servidor MCP (HTTP) escuchando en http://localhost:${port}/mcp`);
  });
}
