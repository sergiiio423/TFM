import { z } from 'zod';
import { setLang, t } from '../../../src/i18n.js';
import { getApiKey, callAPI, parseLLMJson } from '../llm.js';
import { buildGatewayBranchesPrompt, bpmnJsonExpertPrompt } from '../prompts.js';

export const name = 'suggest_gateway_branches';

export const config = {
  title: 'Sugerir los casos/ramas de una puerta (gateway)',
  description: 'A partir de la descripción del proceso y una puerta (exclusiveGateway, '
    + 'parallelGateway o inclusiveGateway) recién confirmada, sugiere entre 2 y 5 nombres de '
    + 'casos/ramas. Si la IA falla o devuelve menos de 2, se usan nombres por defecto y se '
    + 'informa en "errorMsg".',
  inputSchema: {
    description: z.string().describe('Descripción completa del proceso de negocio'),
    gatewayStep: z.object({
      nombre: z.string(),
      tipo: z.enum(['exclusiveGateway', 'parallelGateway', 'inclusiveGateway'])
    }).describe('La puerta recién confirmada'),
    lanes: z.array(z.string()).describe('Departamentos/lanes efectivos del proceso'),
    externalActors: z.array(z.string()).describe('Nombres de los actores externos (puede ser [])'),
    lang: z.enum(['es', 'en']).default('es').describe('Idioma de los textos generados')
  },
  outputSchema: {
    casos: z.array(z.string()).describe('Nombres de los casos/ramas (siempre >= 2)'),
    errorMsg: z.string().nullable().describe('Mensaje de error ya traducido, o null si todo fue bien')
  }
};

export async function handler({ description, gatewayStep, lanes, externalActors, lang }) {
  setLang(lang);

  let casos = [];
  let errorMsg = null;
  try {
    const reply = await callAPI(getApiKey(), bpmnJsonExpertPrompt(),
      [{ role: 'user', content: buildGatewayBranchesPrompt(description, gatewayStep, lanes, externalActors) }]);
    const data = parseLLMJson(reply);
    casos = Array.isArray(data.casos)
      ? data.casos.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim()).slice(0, 8)
      : [];
  } catch (e) {
    errorMsg = t('errorPrefix', { msg: e.message });
  }
  if (casos.length < 2) casos = [t('defaultCaseName', { n: 1 }), t('defaultCaseName', { n: 2 })];

  const result = { casos, errorMsg };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
