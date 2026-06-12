/** Normaliza un nombre de paso para detectar duplicados (minúsculas, sin tildes ni signos). */
export function normStepName(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Corrige sugerencias del LLM antes de usarlas: un paso que envía un mensaje
 * a un actor externo nunca debe ser una tarea normal, sino una tarea de envío.
 */
export function normalizeSuggestion(suggestion) {
  if (suggestion && suggestion.actorExterno && suggestion.tipo === 'task') suggestion.tipo = 'sendTask';
  return suggestion;
}
