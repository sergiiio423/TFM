import { z } from 'zod';
import { setLang, t } from '../../../src/i18n.js';
import { getApiKey, callAPI, parseLLMJson } from '../llm.js';
import { buildStructureSystemPrompt, buildModifyStructurePrompt } from '../prompts.js';
import { buildStructureBPMN } from '../diagramRenderer.js';

export const name = 'modify_structure';

export const config = {
  title: 'Modificar estructura del proceso',
  description: 'Aplica una modificación en lenguaje natural a la estructura de pools/lanes ya '
    + 'confirmada (p.ej. añadir un departamento o un actor externo). Devuelve la estructura '
    + 'actualizada y el XML BPMN correspondiente (solo pools/lanes, sin pasos).',
  inputSchema: {
    currentStructure: z.any().describe('Estructura actual: { poolExterno, poolPrincipal: {nombre, lanes}, resumen }'),
    modification: z.string().describe('Modificación solicitada en lenguaje natural'),
    lang: z.enum(['es', 'en']).default('es').describe('Idioma de los textos generados')
  },
  outputSchema: {
    structure: z.any().describe('Estructura modificada: { poolExterno, poolPrincipal: {nombre, lanes}, resumen }'),
    xml: z.string().describe('XML BPMN actualizado (solo la estructura de pools/lanes, sin pasos)')
  }
};

export async function handler({ currentStructure, modification, lang }) {
  setLang(lang);

  let reply;
  try {
    reply = await callAPI(getApiKey(), buildStructureSystemPrompt(),
      [{ role: 'user', content: buildModifyStructurePrompt(currentStructure, modification) }]);
  } catch (e) {
    throw new Error(t('errorPrefix', { msg: e.message }));
  }

  let structure;
  try {
    structure = parseLLMJson(reply);
    if (!structure.poolPrincipal?.nombre) throw new Error();
  } catch (e) {
    throw new Error(t('errModify'));
  }
  structure.poolPrincipal.lanes = structure.poolPrincipal.lanes || [];

  const xml = buildStructureBPMN(structure);
  const result = { structure, xml };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
