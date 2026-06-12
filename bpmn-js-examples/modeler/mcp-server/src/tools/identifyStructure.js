import { z } from 'zod';
import { setLang, t } from '../../../src/i18n.js';
import { getApiKey, callAPI, parseLLMJson } from '../llm.js';
import { buildStructureSystemPrompt } from '../prompts.js';
import { buildStructureBPMN } from '../diagramRenderer.js';

export const name = 'identify_structure';

export const config = {
  title: 'Identificar estructura del proceso',
  description: 'Analiza la descripción de un proceso de negocio en lenguaje natural e identifica '
    + 'los actores externos (poolExterno), la organización principal y sus departamentos '
    + '(poolPrincipal.lanes). Devuelve también el XML BPMN inicial (solo pools/lanes, sin pasos).',
  inputSchema: {
    description: z.string().describe('Descripción en lenguaje natural del proceso de negocio'),
    lang: z.enum(['es', 'en']).default('es').describe('Idioma de los textos generados')
  },
  outputSchema: {
    structure: z.any().describe('{ poolExterno: [{nombre,rol}], poolPrincipal: {nombre, lanes}, resumen }'),
    xml: z.string().describe('XML BPMN inicial (solo la estructura de pools/lanes, sin pasos)')
  }
};

export async function handler({ description, lang }) {
  setLang(lang);

  let reply;
  try {
    reply = await callAPI(getApiKey(), buildStructureSystemPrompt(), [{ role: 'user', content: description }]);
  } catch (e) {
    throw new Error(t('errorPrefix', { msg: e.message }));
  }

  let structure;
  try {
    structure = parseLLMJson(reply);
    if (!structure.poolPrincipal?.nombre) throw new Error();
  } catch (e) {
    throw new Error(t('errStructure'));
  }
  structure.poolPrincipal.lanes = structure.poolPrincipal.lanes || [];

  const xml = buildStructureBPMN(structure);
  const result = { structure, xml };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
