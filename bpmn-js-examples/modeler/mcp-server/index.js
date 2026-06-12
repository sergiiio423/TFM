import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// El .env vive en la raíz del proyecto (modeler/.env), junto a package.json.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

const useStdio = process.argv.includes('--stdio');

if (useStdio) {
  const { startStdioServer } = await import('./src/stdio.js');
  await startStdioServer();
} else {
  const { startHttpServer } = await import('./src/httpServer.js');
  // Render (y otros PaaS) asignan el puerto vía process.env.PORT.
  startHttpServer(Number(process.env.PORT || process.env.MCP_PORT) || 3001);
}
