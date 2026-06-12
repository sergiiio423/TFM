import { z } from 'zod';
import { setLang, t } from '../../../src/i18n.js';
import { getApiKey, callAPI, parseLLMJson } from '../llm.js';
import { buildFlowStartPrompt, bpmnJsonExpertPrompt } from '../prompts.js';

export const name = 'suggest_flow_start';

export const config = {
  title: 'Sugerir punto(s) de inicio del proceso',
  description: 'A partir de la descripción del proceso, sugiere el/los punto(s) de inicio '
    + '(evento de inicio), indicando el departamento, si lo dispara un mensaje de un actor '
    + 'externo y cuál. Si la IA falla, devuelve un inicio por defecto y el error en "errorMsg".',
  inputSchema: {
    description: z.string().describe('Descripción completa del proceso de negocio'),
    lanes: z.array(z.string()).describe('Departamentos/lanes efectivos del proceso'),
    externalActors: z.array(z.string()).describe('Nombres de los actores externos (puede ser [])'),
    lang: z.enum(['es', 'en']).default('es').describe('Idioma de los textos generados')
  },
  outputSchema: {
    inicios: z.array(z.object({
      lane: z.string(),
      nombre: z.string(),
      trigger: z.enum(['message', 'none']),
      from: z.string().nullable()
    })),
    errorMsg: z.string().nullable().describe('Mensaje de error ya traducido, o null si todo fue bien')
  }
};

export async function handler({ description, lanes, externalActors, lang }) {
  setLang(lang);

  let inicios = [];
  let errorMsg = null;
  try {
    const reply = await callAPI(getApiKey(), bpmnJsonExpertPrompt(),
      [{ role: 'user', content: buildFlowStartPrompt(description, lanes, externalActors) }]);
    const data = parseLLMJson(reply);
    inicios = Array.isArray(data.inicios) ? data.inicios : [];
  } catch (e) {
    errorMsg = t('errorPrefix', { msg: e.message });
  }

  if (inicios.length === 0) {
    inicios = [{ lane: lanes[0], nombre: t('defaultStartName'), trigger: 'none', from: null }];
  }

  const result = { inicios, errorMsg };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
