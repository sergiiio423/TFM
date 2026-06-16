/** Normaliza un nombre de paso para detectar duplicados (minúsculas, sin tildes ni signos). */
export function normStepName(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Detecta si el LLM devolvió un nombre de paso genérico/placeholder en vez de uno real. */
const PLACEHOLDER_NAMES = new Set([
  'siguiente paso', 'next step', 'siguiente', 'proximo paso', 'paso siguiente',
  'nuevo paso', 'new step', 'paso', 'step', 'tarea', 'task', 'actividad', 'activity'
]);
export function isPlaceholderName(nombre) {
  return PLACEHOLDER_NAMES.has(normStepName(nombre));
}

/**
 * Corrige sugerencias del LLM antes de usarlas: un paso que envía un mensaje
 * a un actor externo nunca debe ser una tarea normal, sino una tarea de envío.
 */
export function normalizeSuggestion(suggestion) {
  if (suggestion && suggestion.actorExterno && suggestion.tipo === 'task') suggestion.tipo = 'sendTask';
  return suggestion;
}
