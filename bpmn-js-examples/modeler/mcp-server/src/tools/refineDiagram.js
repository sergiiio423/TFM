import { z } from 'zod';
import { setLang, t } from '../../../src/i18n.js';
import { getApiKey, callAPI, cleanXML } from '../llm.js';
import { buildRefinementSystemPrompt, buildRefinementMessage } from '../prompts.js';
import { renderDiagramFromState } from '../diagramRenderer.js';

export const name = 'refine_diagram';

export const config = {
  title: 'Refinar el diagrama mediante una instrucción en lenguaje natural',
  description: 'Aplica una modificación libre en lenguaje natural sobre el diagrama BPMN '
    + 'actual (p.ej. "añade una tarea de notificación al cliente tras el pago") y devuelve el '
    + 'XML BPMN completo modificado.',
  inputSchema: {
    structure: z.any().describe('Estructura confirmada: { poolExterno, poolPrincipal: {nombre, lanes}, resumen }'),
    diagramState: z.object({
      steps: z.array(z.any())
    }).describe('Estado actual del diagrama: { steps: [...] }'),
    instruction: z.string().describe('Instrucción de modificación en lenguaje natural'),
    lang: z.enum(['es', 'en']).default('es').describe('Idioma de los textos generados')
  },
  outputSchema: {
    xml: z.string().describe('XML BPMN 2.0 completo modificado')
  }
};

export async function handler({ structure, diagramState, instruction, lang }) {
  setLang(lang);

  try {
    const currentXML = renderDiagramFromState(structure, diagramState);
    const rawXML = await callAPI(getApiKey(), buildRefinementSystemPrompt(),
      [{ role: 'user', content: buildRefinementMessage(instruction, currentXML) }]);
    const xml = cleanXML(rawXML);
    const result = { xml };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  } catch (e) {
    throw new Error(t('errorPrefix', { msg: e.message }));
  }
}
