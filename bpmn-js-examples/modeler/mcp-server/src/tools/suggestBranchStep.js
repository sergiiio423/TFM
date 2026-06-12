import { z } from 'zod';
import { setLang, t } from '../../../src/i18n.js';
import { getApiKey, callAPI, parseLLMJson } from '../llm.js';
import { buildBranchStepPrompt, bpmnJsonExpertPrompt } from '../prompts.js';
import { normStepName, normalizeSuggestion } from '../stepUtils.js';
import { MAX_BRANCH_STEPS } from '../constants.js';

export const name = 'suggest_branch_step';

export const config = {
  title: 'Sugerir el siguiente paso dentro de una rama de un gateway',
  description: 'Sugiere el siguiente paso de un caso/rama de un gateway, evitando repetir '
    + 'pasos ya confirmados EN ESA RAMA (hasta 2 intentos con aviso explícito a la IA si '
    + 'repite). Devuelve la sugerencia, si es el último paso de la rama (esFinalRama), si esa '
    + 'rama termina el proceso completo (terminaProceso), si la IA insistió en repetir un paso '
    + '(dupPersistente) y si se alcanzó el límite de pasos de la rama.',
  inputSchema: {
    description: z.string().describe('Descripción completa del proceso de negocio'),
    lanes: z.array(z.string()).describe('Departamentos/lanes efectivos del proceso'),
    externalActors: z.array(z.string()).describe('Nombres de los actores externos (puede ser [])'),
    gatewayStep: z.object({
      nombre: z.string(),
      tipo: z.enum(['exclusiveGateway', 'parallelGateway', 'inclusiveGateway'])
    }).describe('La puerta de la que sale la rama'),
    branch: z.object({
      nombre: z.string(),
      steps: z.array(z.any())
    }).describe('Rama actual: nombre del caso y pasos ya confirmados de esa rama'),
    lang: z.enum(['es', 'en']).default('es').describe('Idioma de los textos generados')
  },
  outputSchema: {
    suggestion: z.object({
      tipo: z.string(),
      nombre: z.string(),
      lane: z.string(),
      actorExterno: z.string().nullable().optional()
    }),
    esFinalRama: z.boolean(),
    terminaProceso: z.boolean(),
    dupPersistente: z.boolean(),
    limitReached: z.boolean(),
    errorMsg: z.string().nullable()
  }
};

export async function handler({ description, lanes, externalActors, gatewayStep, branch, lang }) {
  setLang(lang);

  let suggestion = { tipo: 'task', nombre: t('defaultNextStepName'), lane: lanes[gatewayStep.laneIdx] ?? lanes[0], actorExterno: null };
  let esFinalRama = branch.steps.length >= MAX_BRANCH_STEPS;
  let terminaProceso = false;
  let dupPersistente = false;
  let limitReached = false;
  let errorMsg = null;

  if (!esFinalRama) {
    // Antirrepetición: solo cuentan los pasos de ESTA rama (otras ramas
    // pueden tener pasos parecidos legítimamente).
    const usados = branch.steps.map(s => normStepName(s.nombre));
    let prompt = buildBranchStepPrompt(description, lanes, externalActors, gatewayStep, branch);
    try {
      // Hasta 2 intentos: si la IA repite un paso, se le avisa explícitamente
      // y se le pide uno nuevo; solo si insiste se cierra el caso.
      for (let intento = 0; intento < 2; intento++) {
        const reply = await callAPI(getApiKey(), bpmnJsonExpertPrompt(), [{ role: 'user', content: prompt }]);
        const data = parseLLMJson(reply);
        if (data.siguiente) suggestion = normalizeSuggestion(data.siguiente);
        esFinalRama = !!data.esFinalRama;
        terminaProceso = !!data.terminaProceso;
        if (!usados.includes(normStepName(suggestion.nombre))) { dupPersistente = false; break; }
        dupPersistente = true;
        prompt += `\n\nATENCIÓN: sugeriste "${suggestion.nombre}", que YA ESTÁ en esta rama (paso confirmado). Sugiere un paso DIFERENTE y NUEVO de esta rama según la descripción; si la rama no tiene más pasos nuevos, devuelve el último paso pendiente con "esFinalRama": true.`;
      }
    } catch (e) {
      errorMsg = t('errorPrefix', { msg: e.message });
      // No se pudo consultar al LLM: cierra esta rama ahora (convergiendo)
      // en vez de seguir generando pasos de relleno hasta MAX_BRANCH_STEPS.
      esFinalRama = true;
    }
  } else {
    limitReached = true;
  }

  normalizeSuggestion(suggestion);

  const result = { suggestion, esFinalRama, terminaProceso, dupPersistente, limitReached, errorMsg };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
