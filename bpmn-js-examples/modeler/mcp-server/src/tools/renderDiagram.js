import { z } from 'zod';
import { renderDiagramFromState } from '../diagramRenderer.js';

export const name = 'render_diagram';

export const config = {
  title: 'Renderizar el diagrama BPMN',
  description: 'Genera el XML BPMN 2.0 completo (pools, lanes, elementos, flujos y diagrama '
    + 'visual) a partir de la estructura confirmada y el estado actual del diagrama '
    + '(diagramState.steps, en orden cronológico, con gateways y sus branches/join si los hay).',
  inputSchema: {
    structure: z.any().describe('Estructura confirmada: { poolExterno, poolPrincipal: {nombre, lanes}, resumen }'),
    diagramState: z.object({
      steps: z.array(z.any())
    }).describe('Estado actual del diagrama: { steps: [...] }')
  },
  outputSchema: {
    xml: z.string().describe('XML BPMN 2.0 completo')
  }
};

export async function handler({ structure, diagramState }) {
  const xml = renderDiagramFromState(structure, diagramState);
  const result = { xml };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
