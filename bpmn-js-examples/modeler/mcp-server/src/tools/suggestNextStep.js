import { z } from 'zod';
import { setLang, t } from '../../../src/i18n.js';
import { getApiKey, callAPI, parseLLMJson } from '../llm.js';
import { buildNextStepPrompt, bpmnJsonExpertPrompt } from '../prompts.js';
import { normStepName, normalizeSuggestion } from '../stepUtils.js';
import { MAX_FLOW_STEPS } from '../constants.js';

export const name = 'suggest_next_step';

export const config = {
  title: 'Sugerir el siguiente paso del flujo principal',
  description: 'Sugiere el siguiente paso del flujo principal del proceso, evitando repetir '
    + 'pasos ya confirmados (hasta 2 intentos con aviso explícito a la IA si repite). '
    + 'Devuelve la sugerencia, si debería ser el último paso (esFinal), si la IA insistió en '
    + 'repetir un paso ya confirmado (dupPersistente) y si se alcanzó el límite de pasos.',
  inputSchema: {
    description: z.string().describe('Descripción completa del proceso de negocio'),
    lanes: z.array(z.string()).describe('Departamentos/lanes efectivos del proceso'),
    externalActors: z.array(z.string()).describe('Nombres de los actores externos (puede ser [])'),
    steps: z.array(z.any()).describe('diagramState.steps actual (orden cronológico, incluye gateways con branches/join)'),
    lang: z.enum(['es', 'en']).default('es').describe('Idioma de los textos generados')
  },
  outputSchema: {
    suggestion: z.object({
      tipo: z.string(),
      nombre: z.string(),
      lane: z.string(),
      actorExterno: z.string().nullable().optional()
    }),
    esFinal: z.boolean(),
    dupPersistente: z.boolean(),
    limitReached: z.boolean(),
    errorMsg: z.string().nullable()
  }
};

export async function handler({ description, lanes, externalActors, steps, lang }) {
  setLang(lang);

  const mainSteps = steps.filter(s => s.tipo !== 'startEvent' && s.tipo !== 'endEvent');

  let suggestion = { tipo: 'task', nombre: t('defaultNextStepName'), lane: lanes[0], actorExterno: null };
  let esFinal = mainSteps.length >= MAX_FLOW_STEPS;
  let dupPersistente = false;
  let limitReached = false;
  let errorMsg = null;

  if (!esFinal) {
    // Antirrepetición: solo cuentan los pasos del flujo PRINCIPAL — los pasos
    // de las ramas pueden reutilizar nombres legítimamente (p.ej. tras el join).
    const usados = mainSteps.map(s => normStepName(s.nombre));
    let prompt = buildNextStepPrompt(description, lanes, externalActors, steps);
    try {
      // Hasta 2 intentos: si la IA repite un paso, se le avisa explícitamente
      // y se le pide uno nuevo; solo si insiste se considera que ha terminado.
      for (let intento = 0; intento < 2; intento++) {
        const reply = await callAPI(getApiKey(), bpmnJsonExpertPrompt(), [{ role: 'user', content: prompt }]);
        const data = parseLLMJson(reply);
        if (data.siguiente) suggestion = normalizeSuggestion(data.siguiente);
        esFinal = !!data.esFinal;
        if (!usados.includes(normStepName(suggestion.nombre))) { dupPersistente = false; break; }
        dupPersistente = true;
        prompt += `\n\nATENCIÓN: sugeriste "${suggestion.nombre}", que YA ESTÁ en el diagrama (paso confirmado). Sugiere el siguiente paso DIFERENTE y NUEVO según la descripción; si ya no quedan pasos nuevos, devuelve el último paso pendiente con "esFinal": true.`;
      }
    } catch (e) {
      errorMsg = t('errorPrefix', { msg: e.message });
      // No se pudo consultar al LLM: en vez de seguir generando "Siguiente
      // paso" en bucle hasta MAX_FLOW_STEPS, se cierra el diagrama ahora con
      // este último paso de relleno.
      esFinal = true;
    }
  } else {
    limitReached = true;
  }

  normalizeSuggestion(suggestion);

  const result = { suggestion, esFinal, dupPersistente, limitReached, errorMsg };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
