import { t } from '../../src/i18n.js';

/**
 * Lanes "efectivas" para los prompts: si la organización no tiene departamentos
 * (piscina única), se usa el nombre de la organización como única "calle" lógica
 * (laneIdx 0).
 */
export function effectiveLanes(structure) {
  const l = structure?.poolPrincipal?.lanes || [];
  return l.length > 0 ? l : [structure?.poolPrincipal?.nombre || t('defaultOrgName')];
}

export function elementLabel(tipo) {
  const keys = {
    task:                   'elTask',
    userTask:               'elUserTask',
    serviceTask:            'elServiceTask',
    sendTask:               'elSendTask',
    intermediateCatchEvent: 'elIntermediateCatch',
    intermediateThrowEvent: 'elIntermediateThrow',
    compensationEvent:      'elCompensation',
    timerEvent:             'elTimer',
    endMessageEvent:        'elEndMessage',
    errorEndEvent:          'elErrorEnd',
    exclusiveGateway:       'elExclusiveGw',
    parallelGateway:        'elParallelGw',
    inclusiveGateway:       'elInclusiveGw',
    startEvent:             'elStart',
    endEvent:               'elEnd',
  };
  return t(keys[tipo] || 'elTask');
}
