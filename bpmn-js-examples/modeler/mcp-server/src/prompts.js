import { langDirective } from '../../src/i18n.js';
import { elementLabel } from './helpers.js';

// ─── PROMPTS ──────────────────────────────────────────────────────────────────

/** Paso 1: detectar pools y lanes */
export function buildStructureSystemPrompt() {
  return `Eres un experto en modelado de procesos BPMN 2.0 para e-commerce.
Analiza la descripción de un proceso de negocio e identifica los participantes y departamentos.

RESPONDE ÚNICAMENTE con JSON válido (sin texto adicional, sin bloques de código):
{
  "poolExterno": [{"nombre": "nombre del canal o cliente externo", "rol": "cliente"}],
  "poolPrincipal": {
    "nombre": "nombre de la empresa u organización principal",
    "lanes": ["Departamento1", "Departamento2"]
  },
  "resumen": "Una frase resumiendo los participantes"
}

REGLAS:
- poolExterno: canales o actores EXTERNOS (clientes, marketplace, pasarela de pago, transportista, proveedor…). Puede ser [].
- "rol" de cada poolExterno: "cliente" si ese actor es quien RECIBE EL VALOR/resultado del proceso (normalmente
  quien inicia el proceso o a quien se dirige el resultado final, p.ej. el comprador/cliente final);
  "colaborador" para el resto de actores externos que participan pero NO son destinatarios del valor
  (pasarela de pago, transportista, proveedor, marketplace…).
- Si poolExterno no está vacío, debe haber AL MENOS un actor con "rol":"cliente".
- poolPrincipal.lanes: SOLO los departamentos/áreas internas mencionados EXPLÍCITAMENTE en la descripción
  (Ventas, Logística, Atención al Cliente, Finanzas…). Máximo 5.
  Si la descripción NO menciona departamentos ni áreas internas, devuelve [] (lista vacía) — NO inventes departamentos:
  la organización se dibujará como una única piscina sin calles.
- Nombres concisos: 1-3 palabras${langDirective()}`;
}

export function buildModifyStructurePrompt(current, mod) {
  return `Estructura actual:\n${JSON.stringify(current, null, 2)}\n\nModificación: "${mod}"\n\nDevuelve ÚNICAMENTE el JSON modificado (mismo formato, conservando el campo "rol" de cada poolExterno —"cliente" o "colaborador"— y ajustándolo solo si la modificación lo requiere).${langDirective()}`;
}

/**
 * Identifica el/los punto(s) de inicio del proceso.
 * Devuelve JSON: { "inicios": [{ "lane", "nombre", "trigger": "message"|"none", "from": "<actor>"|null }] }
 */
export function buildFlowStartPrompt(description, lanes, externalActors) {
  return `Eres un experto en modelado BPMN 2.0 para e-commerce.
Departamentos internos: ${lanes.join(', ')}
Actores externos: ${externalActors.length > 0 ? externalActors.join(', ') : 'ninguno'}

Descripción del proceso:
${description}

Identifica el/los punto(s) de INICIO del proceso (puede haber varios inicios en paralelo si el proceso arranca por más de un motivo).
Para cada inicio indica:
- "lane": el departamento donde ocurre (uno de los departamentos listados)
- "nombre": nombre breve del evento de inicio
- "trigger": "message" si lo dispara la recepción de un mensaje de un actor externo, o "none" en caso contrario
- "from": si trigger es "message", el nombre de uno de los actores externos; si no, null

REGLAS:
- Si no hay actores externos, usa siempre "trigger":"none" y "from":null.
- Normalmente hay un único inicio; usa varios solo si la descripción lo indica explícitamente.

RESPONDE SOLO con JSON (sin texto adicional):
{"inicios":[{"lane":"${lanes[0]}","nombre":"Inicio","trigger":"none","from":null}]}${langDirective()}`;
}

/**
 * Sugiere el SIGUIENTE paso del proceso dado el contexto y los pasos confirmados.
 * Devuelve JSON: { "siguiente": { "tipo", "nombre", "lane", "actorExterno" }, "esFinal": bool }
 */
export function buildNextStepPrompt(description, lanes, externalActors, steps) {
  const resumen = steps.length > 0
    ? steps.map((s, i) => {
        let line = `${i+1}. [${lanes[s.laneIdx]}] ${elementLabel(s.tipo)}: ${s.nombre}`;
        if (s.branches?.length) {
          line += '\n' + s.branches.map(b =>
            `   · Caso "${b.nombre}": ${b.steps.map(bs => bs.nombre).join(' → ') || '(sin pasos)'}${b.endsHere ? ' [termina el proceso]' : ' [converge]'}`
          ).join('\n');
        }
        return line;
      }).join('\n')
    : '(ninguno todavía)';
  return `Eres un experto en modelado BPMN 2.0 para e-commerce.
Departamentos internos: ${lanes.join(', ')}
Actores externos: ${externalActors.length > 0 ? externalActors.join(', ') : 'ninguno'}

Descripción completa del proceso:
${description}

Pasos confirmados hasta ahora (en orden cronológico):
${resumen}

¿Cuál es el SIGUIENTE paso del proceso, según la descripción? Indica:
- "tipo": uno de task | sendTask | intermediateCatchEvent | intermediateThrowEvent | compensationEvent | timerEvent | endMessageEvent | exclusiveGateway | parallelGateway | inclusiveGateway
- "nombre": nombre breve del paso
- "lane": departamento que lo realiza (uno de los departamentos listados)
- "actorExterno": SOLO si tipo es "sendTask", "intermediateThrowEvent" o "endMessageEvent" y va dirigido a un actor externo, su nombre (uno de los actores externos); si no, null
- "esFinal": true si DESPUÉS de este paso el proceso TERMINA (se añadirá un evento de fin automáticamente)

MUY IMPORTANTE — pasos que ENVÍAN algo a un actor externo:
- Si el paso consiste en ENVIAR un mensaje, notificación, confirmación, factura, aviso o
  cualquier información a un actor externo (p.ej. el cliente), el "tipo" NUNCA puede ser "task":
  usa "sendTask" (tarea de envío de mensaje) si el proceso continúa después, o "endMessageEvent"
  si el proceso termina con ese envío, y rellena SIEMPRE "actorExterno" con el destinatario.

Usa "compensationEvent" (Evento Intermedio de Compensación) cuando el proceso deba deshacer o
revertir una acción anterior (p.ej. anular un cargo ya realizado tras una cancelación).
Usa "timerEvent" (Evento Intermedio de Temporizador) cuando el proceso deba ESPERAR un periodo
de tiempo o hasta un momento determinado antes de continuar (p.ej. "esperar 1 día", "1,5 horas
antes de la entrega").
Usa "endMessageEvent" (Evento de Fin de Mensaje) cuando el ÚLTIMO paso del proceso consista en
ENVIAR un mensaje/notificación final (confirmación, factura, ticket...) y el proceso termine EN
ESE MISMO momento, en lugar de modelar una tarea de envío seguida de un evento de Fin aparte. Si
usas "endMessageEvent", "esFinal" debe ser true y, si el mensaje va a un actor externo (p.ej. el
cliente), indícalo en "actorExterno".

PRESTA ESPECIAL ATENCIÓN A LAS DECISIONES Y RAMIFICACIONES DE LA DESCRIPCIÓN:
- Si, llegados a este punto del proceso, existe una condición que hace que el proceso siga
  caminos DISTINTOS según el caso (p.ej. "si hay stock... si no hay stock...", "según el método
  de pago", "el pedido puede ser aprobado o rechazado", "dependiendo de si el cliente...", "en
  caso de que..."), el SIGUIENTE paso DEBE ser una puerta
  "exclusiveGateway" (XOR) que represente esa decisión — NO sigas con una tarea que ignore la
  ramificación ni la des por hecha.
- Si la descripción indica que, llegados a este punto, dos o más actividades ocurren EN PARALELO
  o SIMULTÁNEAMENTE (p.ej. "al mismo tiempo", "en paralelo", "simultáneamente", "mientras tanto"),
  el SIGUIENTE paso DEBE ser una puerta "parallelGateway" (AND).
- Si la condición permite que se sigan UNO O VARIOS caminos a la vez (no excluyentes entre sí,
  p.ej. "según lo que haya pedido el cliente se prepara comida y/o bebida", "se aplican los
  descuentos que correspondan"), usa "inclusiveGateway" (OR) en lugar de XOR/AND.
- Elige bien entre los tres tipos de puerta: "exclusiveGateway" (XOR, solo UN camino),
  "parallelGateway" (AND, TODOS los caminos), "inclusiveGateway" (OR, uno o varios caminos).
- Usa puertas SOLO para decisiones o paralelismos reales, descritos explícita o implícitamente
  en la descripción; no las inventes si el proceso es estrictamente secuencial sin alternativas.
- No conviertas un proceso con bifurcaciones en una simple secuencia lineal de tareas: cuando la
  narrativa llegue a un punto de decisión o de paralelismo, modélalo con el gateway adecuado en
  ESE momento, no más adelante ni nunca.

REGLAS:
- Si no hay actores externos, "actorExterno" debe ser siempre null.
- PROHIBIDO repetir un paso ya confirmado (ni el mismo nombre ni una variante del mismo paso):
  los pasos listados arriba YA ESTÁN en el diagrama. Si la descripción no contiene ningún paso
  NUEVO después de los confirmados, devuelve el último paso real con "esFinal": true en vez de
  inventar o repetir pasos.

RESPONDE SOLO con JSON (sin texto adicional):
{"siguiente":{"tipo":"task","nombre":"...","lane":"${lanes[0]}","actorExterno":null},"esFinal":false}${langDirective()}`;
}

/**
 * Sugiere los casos/ramas que salen de un gateway.
 * Devuelve JSON: { "casos": ["Hay stock", "Sin stock", ...] }
 */
export function buildGatewayBranchesPrompt(description, gatewayStep, lanes, externalActors) {
  const tipoTxt = gatewayStep.tipo === 'exclusiveGateway'
    ? 'EXCLUSIVA (XOR): solo se sigue UNO de los casos según la condición'
    : gatewayStep.tipo === 'inclusiveGateway'
      ? 'INCLUSIVA (OR): se siguen UNO O VARIOS de los casos según las condiciones'
      : 'PARALELA (AND): se siguen TODOS los caminos a la vez';
  return `Eres un experto en modelado BPMN 2.0 para e-commerce.
Departamentos internos: ${lanes.join(', ')}
Actores externos: ${externalActors.length > 0 ? externalActors.join(', ') : 'ninguno'}

Descripción completa del proceso:
${description}

El proceso ha llegado a una puerta ${tipoTxt}, llamada "${gatewayStep.nombre}".

Según la descripción, ¿qué casos/ramas salen de esta puerta?
- Mínimo 2 y máximo 5 casos.
- Nombres breves de 1-4 palabras (p.ej. "Hay stock" / "Sin stock", o "Pago aceptado" / "Pago rechazado").

RESPONDE SOLO con JSON (sin texto adicional):
{"casos":["Caso 1","Caso 2"]}${langDirective()}`;
}

/**
 * Sugiere el SIGUIENTE paso dentro de una rama/caso de un gateway.
 * Devuelve JSON: { "siguiente": {...}, "esFinalRama": bool, "terminaProceso": bool }
 */
export function buildBranchStepPrompt(description, lanes, externalActors, gatewayStep, branch) {
  const resumen = branch.steps.length > 0
    ? branch.steps.map((s, i) => `${i+1}. [${lanes[s.laneIdx]}] ${elementLabel(s.tipo)}: ${s.nombre}`).join('\n')
    : '(ninguno todavía)';
  return `Eres un experto en modelado BPMN 2.0 para e-commerce.
Departamentos internos: ${lanes.join(', ')}
Actores externos: ${externalActors.length > 0 ? externalActors.join(', ') : 'ninguno'}

Descripción completa del proceso:
${description}

El proceso llegó a la puerta "${gatewayStep.nombre}" (${gatewayStep.tipo === 'exclusiveGateway' ? 'exclusiva/XOR' : gatewayStep.tipo === 'inclusiveGateway' ? 'inclusiva/OR' : 'paralela/AND'}).
Estamos definiendo los pasos del caso/rama: "${branch.nombre}".

Pasos confirmados de ESTA rama hasta ahora:
${resumen}

¿Cuál es el SIGUIENTE paso de esta rama, según la descripción? Indica:
- "tipo": uno de task | sendTask | intermediateCatchEvent | intermediateThrowEvent | compensationEvent | timerEvent | endMessageEvent
  (NO se permiten gateways dentro de una rama)
- "nombre": nombre breve del paso
- "lane": departamento que lo realiza (uno de los departamentos listados)
- "actorExterno": SOLO si tipo es "sendTask", "intermediateThrowEvent" o "endMessageEvent" y va dirigido a un actor externo, su nombre (uno de los actores externos); si no, null
- "esFinalRama": true si este es el ÚLTIMO paso de esta rama
- "terminaProceso": SOLO relevante si esFinalRama es true. true si el proceso COMPLETO termina en esta
  rama (se añadirá un evento de Fin propio); false si la rama CONVERGE con las demás y el proceso
  continúa después de la puerta de unión.

Usa "endMessageEvent" (Evento de Fin de Mensaje) cuando esta rama termine ENVIANDO un mensaje
final (p.ej. al cliente) y el proceso completo acabe ahí mismo: en ese caso "esFinalRama" y
"terminaProceso" deben ser true, y "actorExterno" indica el destinatario si procede.

MUY IMPORTANTE — pasos que ENVÍAN algo a un actor externo:
- Si el paso consiste en ENVIAR un mensaje, notificación, confirmación, factura, aviso o
  cualquier información a un actor externo (p.ej. el cliente), el "tipo" NUNCA puede ser "task":
  usa "sendTask" si la rama continúa después, o "endMessageEvent" si el proceso termina con ese
  envío, y rellena SIEMPRE "actorExterno" con el destinatario.

REGLAS:
- Si no hay actores externos, "actorExterno" debe ser siempre null.
- PROHIBIDO repetir un paso ya confirmado de esta rama (ni el mismo nombre ni una variante):
  los pasos listados arriba YA ESTÁN en el diagrama. Si la descripción no contiene ningún paso
  NUEVO para esta rama, devuelve el último paso real con "esFinalRama": true en vez de inventar
  o repetir pasos.

RESPONDE SOLO con JSON (sin texto adicional):
{"siguiente":{"tipo":"task","nombre":"...","lane":"${lanes[0]}","actorExterno":null},"esFinalRama":false,"terminaProceso":false}${langDirective()}`;
}

/** Prompt de sistema corto reutilizado en las llamadas "rápidas" (inicio, siguiente paso, ramas). */
export function bpmnJsonExpertPrompt() {
  return `Eres experto en modelado BPMN. Responde SOLO con JSON.${langDirective()}`;
}

export function buildRefinementMessage(instruction, currentXML) {
  return `Diagrama BPMN actual:\n\n${currentXML}\n\nAplica esta modificación y devuelve el XML COMPLETO con la sección bpmndi:BPMNDiagram:\n"${instruction}"`;
}

export function buildRefinementSystemPrompt() {
  return `Eres un experto BPMN 2.0. Modifica el diagrama según la instrucción del usuario.
Devuelve SOLO XML válido completo (desde <?xml hasta </definitions>), sin texto ni markdown.
Mantén todos los pools, lanes, sendTasks y messageFlows existentes.
Añade o modifica solo lo que el usuario pida.${langDirective()}`;
}

export function buildPervalSystemPrompt(actorName, scope) {
  const actorCtx = actorName
    ? `FOCO: analiza SOLO los elementos que tienen impacto directo o indirecto en la experiencia de "${actorName}". Ignora los elementos puramente internos sin relación con este actor.`
    : `Analiza todos los elementos indicados.`;
  const scopeCtx = scope === 'entregas'
    ? `El valor percibido se calcula sobre LO QUE LA EMPRESA DEVUELVE/ENVÍA AL CLIENTE (mensajes,
confirmaciones, notificaciones, entregables...), identificado a partir de los flujos de mensaje
hacia el participante externo del cliente. NO evalúes tareas puramente internas que no generan
ninguna comunicación o entrega hacia el cliente.`
    : `No se han identificado comunicaciones o entregas explícitas hacia un participante externo
cliente, así que se analizan todas las tareas del proceso.`;
  return `Eres un experto en análisis de valor percibido PERVAL (Sweeney y Soutar, 2001) aplicado a e-commerce.

${scopeCtx}

${actorCtx}

DIMENSIONES PERVAL:
- Quality (Calidad): fiabilidad, seguridad, rendimiento, satisfacción del servicio
- Price (Precio): ahorro económico, transparencia de costes, relación calidad-precio
- Emotional (Emocional): conveniencia, facilidad, personalización, bienestar, tranquilidad
- Social (Social): reconocimiento, accesibilidad, flexibilidad de entrega/pago

Elementos sin impacto en el actor → clasifícalos como "Interno".

RESPONDE ÚNICAMENTE con JSON:
{
  "tareas": [{"nombre":"...","dimensiones":["Quality"],"valor":"...","justificacion":"..."}],
  "resumen": {"Quality":"...","Price":"...","Emotional":"...","Social":"..."},
  "valorGeneral": "..."
}${langDirective()}`;
}

export function buildPervalUserMessage(xml, tasks, actorName, scope) {
  const actorLine = actorName ? `\nActor a analizar: ${actorName}` : '';
  const header = scope === 'entregas' ? 'ENTREGAS/COMUNICACIONES DE LA EMPRESA AL CLIENTE:' : 'TAREAS DEL PROCESO:';
  return `${header}${actorLine}\n${tasks.map((t,i)=>`${i+1}. ${t}`).join('\n')}\n\nXML BPMN:\n${xml}`;
}
