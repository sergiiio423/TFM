import { z } from 'zod';
import { setLang, t } from '../../../src/i18n.js';
import { getApiKey, callAPI, parseLLMJson } from '../llm.js';
import { buildPervalSystemPrompt, buildPervalUserMessage } from '../prompts.js';

export const name = 'analyze_perval';

export const config = {
  title: 'Analizar el valor percibido (PERVAL) del proceso',
  description: 'Analiza el diagrama BPMN según el modelo de valor percibido PERVAL (Sweeney y '
    + 'Soutar, 2001): para cada tarea/entrega indicada, determina las dimensiones (Quality, '
    + 'Price, Emotional, Social), un resumen por dimensión y una valoración general.',
  inputSchema: {
    xml: z.string().describe('XML BPMN actual del diagrama'),
    tasks: z.array(z.string()).describe('Lista de tareas o entregas a analizar (ya extraídas del XML)'),
    actorName: z.string().nullable().describe('Actor externo en cuyo punto de vista se analiza, o null'),
    scope: z.enum(['entregas', 'tareas']).describe('"entregas" si tasks son comunicaciones/entregas al cliente, "tareas" si son todas las tareas del proceso'),
    lang: z.enum(['es', 'en']).default('es').describe('Idioma de los textos generados')
  },
  outputSchema: {
    data: z.any().describe('{ tareas: [{nombre,dimensiones,valor,justificacion}], resumen: {Quality,Price,Emotional,Social}, valorGeneral }')
  }
};

export async function handler({ xml, tasks, actorName, scope, lang }) {
  setLang(lang);

  let rawResponse;
  try {
    const systemPrompt = buildPervalSystemPrompt(actorName, scope);
    rawResponse = await callAPI(getApiKey(), systemPrompt,
      [{ role: 'user', content: buildPervalUserMessage(xml, tasks, actorName, scope) }]);
  } catch (e) {
    throw new Error(t('pervalError', { msg: e.message }));
  }

  let data;
  try {
    data = parseLLMJson(rawResponse);
  } catch (e) {
    throw new Error(t('pervalParseError'));
  }

  const result = { data };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
