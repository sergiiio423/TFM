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
- "tipo": uno de userTask | serviceTask | sendTask | exclusiveGateway | parallelGateway | inclusiveGateway | timerEvent | intermediateCatchEvent | intermediateThrowEvent | compensationEvent | endMessageEvent | errorEndEvent | task
- "nombre": nombre breve del paso
- "lane": departamento que lo realiza (uno de los departamentos listados)
- "actorExterno": SOLO si tipo es "sendTask", "intermediateThrowEvent" o "endMessageEvent" y va dirigido a un actor externo, su nombre; si no, null
- "esFinal": true si DESPUÉS de este paso el proceso TERMINA

═══ TIPO DE ELEMENTO — REGLAS OBLIGATORIAS (aplica en orden) ═══

▸ GATEWAYS — modela SIEMPRE la estructura real del proceso:
  • "exclusiveGateway" (XOR): cuando el proceso llega a una CONDICIÓN O DECISIÓN que lo bifurca
    en caminos MUTUAMENTE EXCLUYENTES (solo se sigue UNO). Señales: "si…", "en caso de…",
    "dependiendo de…", "cuando…", "según si…". NUNCA ignores una bifurcación real.
  • "parallelGateway" (AND): cuando varias actividades ocurren EN PARALELO o SIMULTÁNEAMENTE y
    TODAS deben completarse. Señales: "al mismo tiempo", "en paralelo", "simultáneamente",
    "mientras tanto", "a la vez". OBLIGATORIO cuando el proceso divide en ramas concurrentes.
  • "inclusiveGateway" (OR): cuando se pueden seguir UNO O VARIOS caminos según condiciones no
    excluyentes. Señales: "según lo que corresponda", "los que apliquen", "uno o más de…".
  Si hay una bifurcación o paralelismo en este punto → pon el gateway AHORA, no en otro paso.

▸ TAREAS — clasifica según quién ejecuta la acción:
  • "userTask": OBLIGATORIO cuando la acción la realiza una PERSONA (empleado, agente, operario…).
    Incluye: revisar, aprobar, gestionar, tramitar, atender, validar manualmente, seleccionar,
    contactar, introducir datos, tomar una decisión, rellenar formulario, inspeccionar físicamente.
    → Si una persona interviene, SIEMPRE "userTask". NUNCA uses "task" para acciones humanas.
  • "serviceTask": OBLIGATORIO cuando la acción la realiza el SISTEMA de forma automática, sin
    intervención humana. Incluye: consultar API, actualizar base de datos, generar documento,
    procesar pago automáticamente, enviar petición a sistema externo, calcular, transformar datos,
    integrar sistemas, lanzar webhook, sincronizar inventario.
    → Si es un sistema automático, SIEMPRE "serviceTask". NUNCA uses "task" para tareas del sistema.
  • "sendTask": OBLIGATORIO para ENVIAR un mensaje, notificación, email, SMS, confirmación,
    factura o aviso a un actor EXTERNO cuando el proceso continúa después. Rellena "actorExterno".
  • "task": SOLO como último recurso si la acción es genuinamente ambigua (ni claramente humana
    ni claramente automática). En la mayoría de procesos de e-commerce no debería aparecer.

▸ EVENTOS INTERMEDIOS — insértalos cuando el proceso necesita esperar o revertir:
  • "timerEvent": OBLIGATORIO cuando el proceso debe ESPERAR un plazo de tiempo antes de
    continuar. Señales: "esperar X días/horas", "al cabo de…", "tras N días laborables",
    "en un plazo de…", "después de…", "pasado el periodo de…", "antes del vencimiento".
    → Siempre que haya una espera temporal explícita o implícita, modélala con timerEvent.
  • "compensationEvent": cuando hay que DESHACER o REVERTIR una acción anterior (anular cargo,
    revertir reserva, devolver stock…).
  • "intermediateCatchEvent": espera de un mensaje entrante de un actor externo.
  • "intermediateThrowEvent": lanza un mensaje a un actor externo sin terminar el proceso.

▸ EVENTOS DE FIN especiales:
  • "endMessageEvent": el proceso TERMINA ENVIANDO un mensaje/notificación final a un actor
    externo (confirmación de pedido, factura, ticket…). "esFinal" debe ser true.
  • "errorEndEvent": el proceso TERMINA con error irrecuperable (pago rechazado definitivamente,
    fraude detectado, cancelación sin solución…). "esFinal" es true automáticamente.

REGLAS ADICIONALES:
- Si no hay actores externos, "actorExterno" debe ser siempre null.
- PROHIBIDO repetir un paso ya confirmado. Si no quedan pasos nuevos, devuelve el último paso
  real con "esFinal": true.
- "nombre" DEBE ser descriptivo y específico. PROHIBIDO: "Siguiente paso", "Tarea", "Actividad".

RESPONDE SOLO con JSON (sin texto adicional):
{"siguiente":{"tipo":"userTask","nombre":"...","lane":"${lanes[0]}","actorExterno":null},"esFinal":false}${langDirective()}`;
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
- "tipo": uno de userTask | serviceTask | sendTask | timerEvent | intermediateCatchEvent | intermediateThrowEvent | compensationEvent | endMessageEvent | errorEndEvent | task
  (NO se permiten gateways dentro de una rama)
- "nombre": nombre breve del paso
- "lane": departamento que lo realiza (uno de los departamentos listados)
- "actorExterno": SOLO si tipo es "sendTask", "intermediateThrowEvent" o "endMessageEvent" y va dirigido a un actor externo, su nombre; si no, null
- "esFinalRama": true si este es el ÚLTIMO paso de esta rama
- "terminaProceso": SOLO si esFinalRama es true. true si el proceso COMPLETO termina aquí; false si converge.

═══ TIPO DE ELEMENTO — REGLAS OBLIGATORIAS (aplica en orden) ═══

▸ TAREAS — clasifica según quién ejecuta:
  • "userTask": OBLIGATORIO cuando la acción la realiza una PERSONA (revisar, aprobar, gestionar,
    tramitar, atender, validar manualmente, contactar, rellenar, inspeccionar, tomar una decisión).
    → NUNCA uses "task" para acciones que realiza una persona.
  • "serviceTask": OBLIGATORIO cuando la acción la realiza el SISTEMA automáticamente (consultar
    API, actualizar BBDD, generar documento, procesar automáticamente, sincronizar, calcular,
    integrar sistemas, lanzar webhook). → NUNCA uses "task" para acciones automáticas del sistema.
  • "sendTask": OBLIGATORIO para ENVIAR mensaje/notificación/email a un actor EXTERNO cuando la
    rama continúa. Rellena siempre "actorExterno".
  • "task": SOLO si la acción es genuinamente ambigua (ni claramente humana ni automática).

▸ EVENTOS INTERMEDIOS:
  • "timerEvent": OBLIGATORIO cuando la rama debe ESPERAR un plazo de tiempo (esperar X días,
    al cabo de N horas, tras el periodo de…, antes del vencimiento…).
  • "compensationEvent": deshacer/revertir una acción anterior de esta rama.
  • "intermediateCatchEvent": esperar un mensaje de un actor externo.
  • "intermediateThrowEvent": lanzar un mensaje a un actor externo sin terminar la rama.

▸ EVENTOS DE FIN de rama (implican esFinalRama=true y terminaProceso=true):
  • "endMessageEvent": esta rama TERMINA enviando un mensaje/notificación final a un actor externo.
  • "errorEndEvent": esta rama TERMINA con error irrecuperable (pago rechazado, fraude, cancelación sin solución…).

MUY IMPORTANTE — ENVÍOS a actores externos:
- NUNCA uses "task" para enviar algo a un actor externo. Usa "sendTask" si la rama continúa,
  o "endMessageEvent" si termina con ese envío. Rellena siempre "actorExterno".

REGLAS:
- Si no hay actores externos, "actorExterno" debe ser siempre null.
- PROHIBIDO repetir un paso ya confirmado de esta rama (ni el mismo nombre ni una variante):
  los pasos listados arriba YA ESTÁN en el diagrama. Si la descripción no contiene ningún paso
  NUEVO para esta rama, devuelve el último paso real con "esFinalRama": true en vez de inventar
  o repetir pasos.
- El "nombre" del paso DEBE ser descriptivo y específico (p.ej. "Preparar pedido parcial",
  "Notificar falta de stock"). PROHIBIDO usar nombres genéricos como "Siguiente paso",
  "Next step", "Tarea", "Actividad", "Paso" o similares.

RESPONDE SOLO con JSON (sin texto adicional):
{"siguiente":{"tipo":"userTask","nombre":"...","lane":"${lanes[0]}","actorExterno":null},"esFinalRama":false,"terminaProceso":false}${langDirective()}`;
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
