// ─── API KEY ──────────────────────────────────────────────────────────────────
const DEFAULT_API_KEY = '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';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './style.css';

import $ from 'jquery';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import diagramXML from '../resources/newDiagram.bpmn';
import { t, getLang, setLang, recognitionLang, langDirective } from './i18n.js';

var container = $('#js-drop-zone');
var modeler   = new BpmnModeler({ container: '#js-canvas' });
window._modeler = modeler;

function createNewDiagram() { openDiagram(diagramXML); }
async function openDiagram(xml) {
  try   { await modeler.importXML(xml); container.removeClass('with-error').addClass('with-diagram'); }
  catch (err) { container.removeClass('with-diagram').addClass('with-error'); container.find('.error pre').text(err.message); }
}
function registerFileDrop(container, callback) {
  function handleFileSelect(e) { e.stopPropagation(); e.preventDefault(); var reader = new FileReader(); reader.onload = e => callback(e.target.result); reader.readAsText(e.dataTransfer.files[0]); }
  function handleDragOver(e)   { e.stopPropagation(); e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  container.get(0).addEventListener('dragover', handleDragOver, false);
  container.get(0).addEventListener('drop', handleFileSelect, false);
}
if (!window.FileList || !window.FileReader) { window.alert(t('useChromeFirefox')); }
else { registerFileDrop(container, openDiagram); }

// ─── ESTADO ───────────────────────────────────────────────────────────────────
// Fases: 'describe' → 'confirm_structure' → 'flow_start' → 'flow_step' (xN) → 'refine'
var fase = 'describe';
var processDescription     = '';
var processFlowDescription = '';
var confirmedStructure  = null;
// diagramState.steps: array global en orden cronológico.
// step: { id, tipo, nombre, laneIdx, participantIdx?, messageTrigger?, fromParticipantIdx? }
// Los gateways (exclusiveGateway/parallelGateway) llevan además:
//   branches: [{ id, nombre, steps: [step...], endsHere: bool }]
//   join?: { id, tipo, nombre:'', laneIdx }   // solo si alguna rama converge
var diagramState        = { steps: [] };
var pervalAnalisado     = false;
// Modo del asistente paso a paso: false = pide confirmación de cada paso (tarjetas);
// true = genera todo el proceso de una vez, con el mismo razonamiento del LLM,
// auto-confirmando cada sugerencia hasta que el diagrama queda completo.
var autoGenerateAll     = false;
const MAX_FLOW_STEPS    = 20;
const MAX_BRANCH_STEPS  = 6;

// ─── HELPERS CHAT ─────────────────────────────────────────────────────────────
function addMessage(text, type = 'ai', style = '') {
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  div.innerHTML = `<div class="msg-av">${type === 'ai' ? '🤖' : '👤'}</div><div class="msg-bubble ${style}">${text}</div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}
function addTyping()   { const m = document.getElementById('ai-messages'); const d = document.createElement('div'); d.className = 'msg ai'; d.id = 'ai-typing'; d.innerHTML = `<div class="msg-av">🤖</div><div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div>`; m.appendChild(d); m.scrollTop = m.scrollHeight; }
function removeTyping(){ const t = document.getElementById('ai-typing'); if (t) t.remove(); }

function updateUI() {
  const btn           = document.getElementById('ai-send');
  const confirmActs   = document.getElementById('ai-confirm-actions');
  const textarea      = document.getElementById('ai-scenario');
  const pervalBtn     = document.getElementById('ai-perval-btn');
  const hint          = document.getElementById('ai-hint');
  const addInfoBtn    = document.getElementById('ai-add-info-btn');

  textarea.disabled = false;
  btn.disabled      = false;

  // Por defecto muestra el botón principal y oculta los de confirmación / añadir info
  btn.style.display         = '';
  if (confirmActs) confirmActs.style.display = 'none';
  if (addInfoBtn)  addInfoBtn.style.display  = 'none';

  if (fase === 'describe') {
    btn.textContent = t('describeBtn');
    btn.className   = 'btn-send btn-blue';
    textarea.placeholder = t('describePlaceholder');
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (hint) hint.textContent = t('hintCtrlEnter');

  } else if (fase === 'confirm_structure') {
    btn.style.display = 'none';
    if (confirmActs) confirmActs.style.display = 'flex';
    textarea.placeholder = t('confirmStructPlaceholder');
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (hint) hint.textContent = t('hintConfirmStruct');

  } else if (fase === 'flow_start') {
    btn.style.display = 'none';
    if (confirmActs) confirmActs.style.display = 'none';
    btn.disabled      = true;
    textarea.disabled = false;
    textarea.placeholder = t('addInfoPlaceholder');
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (addInfoBtn) { addInfoBtn.style.display = 'block'; addInfoBtn.textContent = t('addInfoBtn'); }
    if (hint) hint.textContent = t('hintFlowStart') + t('hintAddInfoSuffix');

  } else if (fase === 'flow_step') {
    btn.style.display = 'none';
    if (confirmActs) confirmActs.style.display = 'none';
    btn.disabled      = true;
    textarea.disabled = false;
    textarea.placeholder = t('addInfoPlaceholder');
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (addInfoBtn) { addInfoBtn.style.display = 'block'; addInfoBtn.textContent = t('addInfoBtn'); }
    const stepNum = (diagramState.steps || []).filter(s => s.tipo !== 'startEvent' && s.tipo !== 'endEvent').length + 1;
    if (hint) hint.textContent = t('hintFlowStep', { n: stepNum }) + t('hintAddInfoSuffix');

  } else if (fase === 'flow_branches') {
    btn.style.display = 'none';
    if (confirmActs) confirmActs.style.display = 'none';
    btn.disabled      = true;
    textarea.disabled = false;
    textarea.placeholder = t('addInfoPlaceholder');
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (addInfoBtn) { addInfoBtn.style.display = 'block'; addInfoBtn.textContent = t('addInfoBtn'); }
    if (hint) hint.textContent = t('hintFlowBranches') + t('hintAddInfoSuffix');

  } else if (fase === 'flow_branch_step') {
    btn.style.display = 'none';
    if (confirmActs) confirmActs.style.display = 'none';
    btn.disabled      = true;
    textarea.disabled = false;
    textarea.placeholder = t('addInfoPlaceholder');
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (addInfoBtn) { addInfoBtn.style.display = 'block'; addInfoBtn.textContent = t('addInfoBtn'); }
    if (hint) hint.textContent = t('hintFlowBranchStep') + t('hintAddInfoSuffix');

  } else { // refine
    btn.textContent = t('refineBtn');
    btn.className   = 'btn-send btn-green';
    textarea.placeholder = t('refinePlaceholder');
    if (pervalBtn) {
      pervalBtn.style.display = 'block';
      pervalBtn.textContent   = pervalAnalisado ? t('pervalBtnReanalyze') : t('pervalBtnAnalyze');
    }
    if (hint) hint.textContent = t('hintRefine');
  }
  if (typeof window.updatePhaseBar === 'function') window.updatePhaseBar(fase);
}

// ─── PROMPTS ──────────────────────────────────────────────────────────────────

/** Paso 1: detectar pools y lanes */
function buildStructureSystemPrompt() {
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

function buildModifyStructurePrompt(current, mod) {
  return `Estructura actual:\n${JSON.stringify(current, null, 2)}\n\nModificación: "${mod}"\n\nDevuelve ÚNICAMENTE el JSON modificado (mismo formato, conservando el campo "rol" de cada poolExterno —"cliente" o "colaborador"— y ajustándolo solo si la modificación lo requiere).${langDirective()}`;
}

/**
 * Identifica el/los punto(s) de inicio del proceso.
 * Devuelve JSON: { "inicios": [{ "lane", "nombre", "trigger": "message"|"none", "from": "<actor>"|null }] }
 */
function buildFlowStartPrompt(description, lanes, externalActors) {
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
function buildNextStepPrompt(description, lanes, externalActors, steps) {
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
- "tipo": uno de task | sendTask | intermediateCatchEvent | intermediateThrowEvent | compensationEvent | timerEvent | endMessageEvent | exclusiveGateway | parallelGateway
- "nombre": nombre breve del paso
- "lane": departamento que lo realiza (uno de los departamentos listados)
- "actorExterno": SOLO si tipo es "sendTask", "intermediateThrowEvent" o "endMessageEvent" y va dirigido a un actor externo, su nombre (uno de los actores externos); si no, null
- "esFinal": true si DESPUÉS de este paso el proceso TERMINA (se añadirá un evento de fin automáticamente)

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
  caso de que...", "si supera un importe..."), el SIGUIENTE paso DEBE ser una puerta
  "exclusiveGateway" (XOR) que represente esa decisión — NO sigas con una tarea que ignore la
  ramificación ni la des por hecha.
- Si la descripción indica que, llegados a este punto, dos o más actividades ocurren EN PARALELO
  o SIMULTÁNEAMENTE (p.ej. "al mismo tiempo", "en paralelo", "simultáneamente", "mientras tanto"),
  el SIGUIENTE paso DEBE ser una puerta "parallelGateway" (AND).
- Usa "exclusiveGateway"/"parallelGateway" SOLO para decisiones o paralelismos reales, descritos
  explícita o implícitamente en la descripción; no los inventes si el proceso es estrictamente
  secuencial sin alternativas.
- No conviertas un proceso con bifurcaciones en una simple secuencia lineal de tareas: cuando la
  narrativa llegue a un punto de decisión o de paralelismo, modélalo con el gateway adecuado en
  ESE momento, no más adelante ni nunca.

REGLAS:
- Si no hay actores externos, "actorExterno" debe ser siempre null.
- No repitas pasos ya confirmados.

RESPONDE SOLO con JSON (sin texto adicional):
{"siguiente":{"tipo":"task","nombre":"...","lane":"${lanes[0]}","actorExterno":null},"esFinal":false}${langDirective()}`;
}

/**
 * Sugiere los casos/ramas que salen de un gateway.
 * Devuelve JSON: { "casos": ["Hay stock", "Sin stock", ...] }
 */
function buildGatewayBranchesPrompt(description, gatewayStep, lanes, externalActors) {
  const tipoTxt = gatewayStep.tipo === 'exclusiveGateway'
    ? 'EXCLUSIVA (XOR): solo se sigue UNO de los casos según la condición'
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
function buildBranchStepPrompt(description, lanes, externalActors, gatewayStep, branch) {
  const resumen = branch.steps.length > 0
    ? branch.steps.map((s, i) => `${i+1}. [${lanes[s.laneIdx]}] ${elementLabel(s.tipo)}: ${s.nombre}`).join('\n')
    : '(ninguno todavía)';
  return `Eres un experto en modelado BPMN 2.0 para e-commerce.
Departamentos internos: ${lanes.join(', ')}
Actores externos: ${externalActors.length > 0 ? externalActors.join(', ') : 'ninguno'}

Descripción completa del proceso:
${description}

El proceso llegó a la puerta "${gatewayStep.nombre}" (${gatewayStep.tipo === 'exclusiveGateway' ? 'exclusiva/XOR' : 'paralela/AND'}).
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

REGLAS:
- Si no hay actores externos, "actorExterno" debe ser siempre null.
- No repitas pasos ya confirmados de esta rama.

RESPONDE SOLO con JSON (sin texto adicional):
{"siguiente":{"tipo":"task","nombre":"...","lane":"${lanes[0]}","actorExterno":null},"esFinalRama":false,"terminaProceso":false}${langDirective()}`;
}

/** Prompt de sistema corto reutilizado en las llamadas "rápidas" (inicio, siguiente paso, ramas). */
function bpmnJsonExpertPrompt() {
  return `Eres experto en modelado BPMN. Responde SOLO con JSON.${langDirective()}`;
}

function buildRefinementMessage(instruction, currentXML) {
  return `Diagrama BPMN actual:\n\n${currentXML}\n\nAplica esta modificación y devuelve el XML COMPLETO con la sección bpmndi:BPMNDiagram:\n"${instruction}"`;
}

// ─── GENERACIÓN PROGRAMÁTICA DEL DIAGRAMA ────────────────────────────────────
function renderDiagramFromState(structure, state) {
  const ext   = structure.poolExterno || [];
  const lanes = structure.poolPrincipal.lanes || [];
  const N     = lanes.length;
  const EH    = 160, EG = 20;
  const X0    = 150, DX = 160;
  const BRANCH_GAP = 110; // > altura de tarea (80) para que las ramas no se solapen

  // diagramState.steps ya está en orden cronológico global.
  const steps  = state.steps || [];
  const starts = steps.filter(s => s.tipo === 'startEvent');
  const ends   = steps.filter(s => s.tipo === 'endEvent');
  const mains  = steps.filter(s => s.tipo !== 'startEvent' && s.tipo !== 'endEvent');

  // Altura de lane: si hay gateways con ramas, dejar sitio para el abanico vertical
  const maxBranches = Math.max(1, ...mains.filter(m => m.branches?.length).map(m => m.branches.length));
  const LH = Math.max(180, maxBranches * BRANCH_GAP + 110);

  // Posiciones X: recorrido secuencial. Las ramas de un gateway se dibujan en
  // paralelo (mismo rango X, desplazamiento vertical _yOffset por rama) y
  // convergen, si procede, en el gateway de unión (join).
  starts.forEach(s => { s._x = X0; s._yOffset = 0; });
  let cursorX = X0 + DX;
  const branchExtras = []; // pasos dentro de ramas + joins (para shapes/refs)
  mains.forEach(step => {
    step._yOffset = 0;
    if ((step.tipo === 'exclusiveGateway' || step.tipo === 'parallelGateway') && step.branches?.length) {
      step._x = cursorX; cursorX += DX;
      let maxLen = 0;
      step.branches.forEach((branch, bi) => {
        const yOff = (bi - (step.branches.length - 1) / 2) * BRANCH_GAP;
        (branch.steps || []).forEach((bstep, j) => {
          bstep._x = cursorX + j * DX; bstep._yOffset = yOff;
          branchExtras.push(bstep);
        });
        maxLen = Math.max(maxLen, (branch.steps || []).length);
      });
      cursorX += Math.max(maxLen, 1) * DX;
      if (step.join) {
        step.join._x = cursorX; step.join._yOffset = 0;
        branchExtras.push(step.join);
        cursorX += DX;
      }
    } else {
      step._x = cursorX; cursorX += DX;
    }
  });
  const endX = cursorX;
  ends.forEach(s => { s._x = endX; s._yOffset = 0; });

  const ordered = [...starts, ...mains, ...branchExtras, ...ends];

  // Pool width: enough to fit all elements + margin
  const PW = Math.max(1200, endX + 300);

  const extY   = i => 30 + i * (EH + EG);
  const extCY  = i => extY(i) + EH / 2;
  const mainY  = ext.length > 0 ? 30 + ext.length * (EH + EG) : 30;
  const mainH  = Math.max(1, N) * LH;
  // Sin lanes (piscina única): los elementos se centran verticalmente en el pool
  const laneCY = j => N > 0 ? mainY + j * LH + LH / 2 : mainY + mainH / 2;

  // ── Collaboration ──────────────────────────────────────────────────────
  let col = '';
  ext.forEach((p, i) => {
    col += `    <participant id="Part_Ext${i+1}" name="${p.nombre}" processRef="Proc_Ext${i+1}"/>\n`;
  });
  col += `    <participant id="Part_Main" name="${structure.poolPrincipal.nombre}" processRef="Proc_Main"/>\n`;
  ordered.forEach(s => {
    if (s.participantIdx !== undefined) {
      col += `    <messageFlow id="MF_${s.id}" name="${s.nombre}" sourceRef="${s.id}" targetRef="Part_Ext${s.participantIdx+1}"/>\n`;
    }
    if (s.tipo === 'startEvent' && s.messageTrigger && s.fromParticipantIdx !== undefined) {
      col += `    <messageFlow id="MF_${s.id}_in" sourceRef="Part_Ext${s.fromParticipantIdx+1}" targetRef="${s.id}"/>\n`;
    }
  });

  // ── External processes ─────────────────────────────────────────────────
  let proc = '';
  ext.forEach((p, i) => { proc += `  <process id="Proc_Ext${i+1}" isExecutable="false"/>\n`; });

  // ── Lane sets ─────────────────────────────────────────────────────────
  let laneSetXml = '';
  lanes.forEach((lane, j) => {
    const refs = ordered.filter(t => t.laneIdx === j)
      .map(t => `        <flowNodeRef>${t.id}</flowNodeRef>`).join('\n');
    laneSetXml += `      <lane id="Lane${j+1}" name="${lane}">\n${refs ? refs+'\n' : ''}      </lane>\n`;
  });

  // ── Task / gateway / event elements ─────────────────────────────────────
  const taskXml = ordered.map(t => {
    const n = (t.nombre || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    if (t.tipo === 'startEvent')
      return `    <startEvent id="${t.id}" name="${n}">${t.messageTrigger ? `<messageEventDefinition id="MED_${t.id}"/>` : ''}</startEvent>`;
    if (t.tipo === 'endEvent')
      return t.messageTrigger
        ? `    <endEvent id="${t.id}" name="${n}"><messageEventDefinition id="MED_${t.id}"/></endEvent>`
        : `    <endEvent id="${t.id}" name="${n}"/>`;
    if (t.tipo === 'exclusiveGateway') return `    <exclusiveGateway id="${t.id}" name="${n}"/>`;
    if (t.tipo === 'parallelGateway')  return `    <parallelGateway  id="${t.id}" name="${n}"/>`;
    if (t.tipo === 'intermediateCatchEvent')
      return `    <intermediateCatchEvent id="${t.id}" name="${n}"><messageEventDefinition id="MED_${t.id}"/></intermediateCatchEvent>`;
    if (t.tipo === 'intermediateThrowEvent')
      return `    <intermediateThrowEvent id="${t.id}" name="${n}"><messageEventDefinition id="MED_${t.id}"/></intermediateThrowEvent>`;
    if (t.tipo === 'compensationEvent')
      return `    <intermediateThrowEvent id="${t.id}" name="${n}"><compensateEventDefinition id="CED_${t.id}"/></intermediateThrowEvent>`;
    if (t.tipo === 'timerEvent')
      return `    <intermediateCatchEvent id="${t.id}" name="${n}"><timerEventDefinition id="TED_${t.id}"/></intermediateCatchEvent>`;
    if (t.tipo === 'sendTask') return `    <sendTask id="${t.id}" name="${n}"/>`;
    return `    <task id="${t.id}" name="${n}"/>`;
  }).join('\n');

  // ── Sequence flows ──────────────────────────────────────────────────────
  // start(s) → pasos intermedios (con bifurcación/convergencia en gateways
  // con ramas) → fin(es). Cada entrada de chain es [src, tgt, name?].
  const escName = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const chain = [];
  if (mains.length > 0) {
    starts.forEach(s => chain.push([s.id, mains[0].id]));
    mains.forEach((m, i) => {
      const next = mains[i+1];
      if ((m.tipo === 'exclusiveGateway' || m.tipo === 'parallelGateway') && m.branches?.length) {
        m.branches.forEach(branch => {
          const bsteps = branch.steps || [];
          // En XOR el flujo saliente lleva el nombre del caso (condición)
          const flowName = m.tipo === 'exclusiveGateway' ? branch.nombre : '';
          if (bsteps.length > 0) {
            chain.push([m.id, bsteps[0].id, flowName]);
            for (let j = 0; j < bsteps.length - 1; j++) chain.push([bsteps[j].id, bsteps[j+1].id]);
            // Si la rama termina el proceso, su último paso ya es un endEvent: no sale nada de él
            if (!branch.endsHere && m.join) chain.push([bsteps[bsteps.length-1].id, m.join.id]);
          } else if (m.join) {
            chain.push([m.id, m.join.id, flowName]);
          }
        });
        if (m.join) {
          if (next) chain.push([m.join.id, next.id]);
          else ends.forEach(e => chain.push([m.join.id, e.id]));
        }
        // Sin join (todas las ramas terminan el proceso): no hay continuación.
      } else {
        if (next) chain.push([m.id, next.id]);
        else ends.forEach(e => chain.push([m.id, e.id]));
      }
    });
  } else {
    starts.forEach(s => ends.forEach(e => chain.push([s.id, e.id])));
  }
  const seqXml = chain.map(([src, tgt, name], i) =>
    `    <sequenceFlow id="SF_${i}" sourceRef="${src}" targetRef="${tgt}"${name ? ` name="${escName(name)}"` : ''}/>`
  ).join('\n');

  const laneSetBlock = N > 0 ? `    <laneSet id="LaneSet_1">\n${laneSetXml}    </laneSet>\n` : '';
  proc += `\n  <process id="Proc_Main" isExecutable="false">
${laneSetBlock}${taskXml ? taskXml+'\n' : ''}${seqXml ? seqXml+'\n' : ''}  </process>`;

  // ── DI shapes ─────────────────────────────────────────────────────────
  let shapes = '', edges = '';

  ext.forEach((p, i) => {
    shapes += `      <bpmndi:BPMNShape id="Shape_Part_Ext${i+1}" bpmnElement="Part_Ext${i+1}" isHorizontal="true">
        <dc:Bounds x="30" y="${extY(i)}" width="${PW}" height="${EH}"/>
      </bpmndi:BPMNShape>\n`;
  });
  shapes += `      <bpmndi:BPMNShape id="Shape_Part_Main" bpmnElement="Part_Main" isHorizontal="true">
        <dc:Bounds x="30" y="${mainY}" width="${PW}" height="${mainH}"/>
      </bpmndi:BPMNShape>\n`;
  lanes.forEach((_, j) => {
    shapes += `      <bpmndi:BPMNShape id="Shape_Lane${j+1}" bpmnElement="Lane${j+1}" isHorizontal="true">
        <dc:Bounds x="60" y="${mainY+j*LH}" width="${PW-30}" height="${LH}"/>
      </bpmndi:BPMNShape>\n`;
  });

  // Element shapes (size depends on tipo)
  const isGwTipo = t => t === 'exclusiveGateway' || t === 'parallelGateway';
  const isEvTipo = t => t === 'intermediateCatchEvent' || t === 'intermediateThrowEvent'
                     || t === 'compensationEvent' || t === 'timerEvent'
                     || t === 'startEvent' || t === 'endEvent';
  const shapeW = t => isGwTipo(t.tipo) ? 50 : isEvTipo(t.tipo) ? 36 : 100;
  const shapeH = t => isGwTipo(t.tipo) ? 50 : isEvTipo(t.tipo) ? 36 : 80;
  const elemCY = t => laneCY(t.laneIdx) + (t._yOffset || 0);

  ordered.forEach(t => {
    const w = shapeW(t), h = shapeH(t);
    shapes += `      <bpmndi:BPMNShape id="Shape_${t.id}" bpmnElement="${t.id}"${isGwTipo(t.tipo) ? ' isMarkerVisible="true"' : ''}>
        <dc:Bounds x="${t._x-w/2}" y="${elemCY(t)-h/2}" width="${w}" height="${h}"/>
      </bpmndi:BPMNShape>\n`;
  });

  // ── DI edges ──────────────────────────────────────────────────────────
  const elemOf = id => ordered.find(o => o.id === id);

  // Sequence flow edges: anclados a los bordes de las figuras; si origen y
  // destino están a distinta altura, ruta ortogonal (horizontal-vertical-horizontal)
  chain.forEach(([src, tgt], i) => {
    const s = elemOf(src), t = elemOf(tgt);
    if (!s || !t) return;
    const sy = elemCY(s), ty = elemCY(t);
    const sx = s._x + shapeW(s) / 2; // borde derecho del origen
    const tx = t._x - shapeW(t) / 2; // borde izquierdo del destino
    const wps = Math.abs(sy - ty) < 1
      ? [[sx, sy], [tx, ty]]
      : [[sx, sy], [(sx + tx) / 2, sy], [(sx + tx) / 2, ty], [tx, ty]];
    edges += `      <bpmndi:BPMNEdge id="Edge_SF_${i}" bpmnElement="SF_${i}">
${wps.map(([x, y]) => `        <di:waypoint x="${x}" y="${y}"/>`).join('\n')}
      </bpmndi:BPMNEdge>\n`;
  });

  // Message flow edges: salientes (sendTask/throw → actor externo), incluidos pasos de ramas
  ordered.filter(t => t.participantIdx !== undefined).forEach(t => {
    const srcY = elemCY(t) - shapeH(t) / 2; // borde superior
    edges += `      <bpmndi:BPMNEdge id="Edge_MF_${t.id}" bpmnElement="MF_${t.id}">
        <di:waypoint x="${t._x}" y="${srcY}"/>
        <di:waypoint x="${t._x}" y="${extCY(t.participantIdx)}"/>
      </bpmndi:BPMNEdge>\n`;
  });

  // Message flow edges: entrantes (actor externo → startEvent con disparador de mensaje)
  starts.filter(s => s.messageTrigger && s.fromParticipantIdx !== undefined).forEach(s => {
    const tgtY = elemCY(s) - shapeH(s) / 2; // borde superior del evento de inicio
    edges += `      <bpmndi:BPMNEdge id="Edge_MF_${s.id}_in" bpmnElement="MF_${s.id}_in">
        <di:waypoint x="${s._x}" y="${extCY(s.fromParticipantIdx)}"/>
        <di:waypoint x="${s._x}" y="${tgtY}"/>
      </bpmndi:BPMNEdge>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <collaboration id="Collab_1">
${col}  </collaboration>
${proc}
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collab_1">
${shapes}${edges}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;
}

// Alias para la estructura vacía inicial (sin pasos aún)
function buildStructureBPMN(structure) {
  return renderDiagramFromState(structure, { steps: [] });
}

// ─── TARJETA ESTRUCTURA ───────────────────────────────────────────────────────
function showStructureCard(structure) {
  const messages = document.getElementById('ai-messages');
  const old = document.getElementById('structure-card'); if (old) old.remove();
  const div = document.createElement('div');
  div.className = 'msg ai'; div.id = 'structure-card';

  const extChips = (structure.poolExterno || []).length > 0
    ? (structure.poolExterno || []).map(p => {
        const isClient = p.rol === 'cliente';
        return `<span class="struct-chip ${isClient ? 'client-chip' : 'ext-chip'}">${isClient ? '🧑‍💼' : '🤝'} ${p.nombre}</span>`;
      }).join('')
    : `<span class="struct-chip none-chip">${t('structNone')}</span>`;
  const laneChips = (structure.poolPrincipal.lanes || []).length > 0
    ? (structure.poolPrincipal.lanes || []).map(l => `<span class="struct-chip lane-chip">📋 ${l}</span>`).join('')
    : `<span class="struct-chip none-chip">${t('structSinglePool')}</span>`;
  const extLegend = (structure.poolExterno || []).length > 0
    ? `<div class="struct-legend">${t('structLegend')}</div>`
    : '';

  div.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble structure-bubble">
      <div class="struct-row">
        <div class="struct-col">
          <div class="struct-label">${t('structExtLabel')}</div>
          <div class="struct-chips">${extChips}</div>
          ${extLegend}
        </div>
        <div class="struct-col">
          <div class="struct-label">${t('structOrgLabel')}</div>
          <div class="struct-main-name">🏢 ${structure.poolPrincipal.nombre}</div>
          <div class="struct-label" style="margin-top:8px">${t('structLanesLabel')}</div>
          <div class="struct-chips">${laneChips}</div>
        </div>
      </div>
    </div>`;

  messages.appendChild(div); messages.scrollTop = messages.scrollHeight;
}

// ─── TARJETA INICIO DEL PROCESO ───────────────────────────────────────────────
/**
 * Convierte la sugerencia cruda del LLM (inicios = [{ lane, nombre, trigger, from }])
 * en el formato editable usado por la tarjeta y por handleConfirmStarts.
 */
function inicioToItems(inicios) {
  const lanes = effectiveLanes();
  const ext   = confirmedStructure.poolExterno || [];
  return (inicios.length > 0 ? inicios : [{ lane: lanes[0], nombre: t('defaultStartName'), trigger: 'none', from: null }])
    .map(s => ({
      nombre:  s.nombre || t('defaultStartName'),
      laneIdx: Math.max(0, lanes.indexOf(s.lane)),
      trigger: (s.trigger === 'message' && ext.length > 0) ? 'message' : 'none',
      fromIdx: s.trigger === 'message' ? Math.max(0, ext.findIndex(p => p.nombre === s.from)) : 0
    }));
}

/**
 * Muestra la tarjeta para confirmar/editar el o los puntos de inicio del proceso.
 * inicios = [{ lane, nombre, trigger: 'message'|'none', from }]
 */
function showStartCard(inicios) {
  const messages = document.getElementById('ai-messages');
  const old = document.getElementById('start-card'); if (old) old.remove();

  const lanes = effectiveLanes();
  const ext   = confirmedStructure.poolExterno || [];

  // Estado editable local
  const items = inicioToItems(inicios);

  const wrapper = document.createElement('div');
  wrapper.className = 'msg ai'; wrapper.id = 'start-card';

  function rowsHtml() {
    if (items.length === 0) return `<p class="val-empty">${t('startNoneYet')}</p>`;
    return items.map((it, i) => `
      <div class="del-row">
        <span class="del-chip-icon">🏁</span>
        <input type="text" class="val-desc-input del-name-input" data-idx="${i}" data-field="nombre"
          value="${(it.nombre||'').replace(/"/g,'&quot;')}" style="flex:1;min-width:90px">
        <select class="del-lane-sel" data-idx="${i}" data-field="laneIdx">${
          lanes.map((l, li) => `<option value="${li}"${li===it.laneIdx?' selected':''}>${l}</option>`).join('')
        }</select>
        <select class="del-lane-sel" data-idx="${i}" data-field="trigger">
          <option value="none"${it.trigger==='none'?' selected':''}>${t('startNoTrigger')}</option>
          ${ext.length > 0 ? `<option value="message"${it.trigger==='message'?' selected':''}>${t('startMsgTrigger')}</option>` : ''}
        </select>
        ${it.trigger === 'message' ? `
        <select class="del-lane-sel" data-idx="${i}" data-field="fromIdx">${
          ext.map((p, pi) => `<option value="${pi}"${pi===it.fromIdx?' selected':''}>${t('startFromActor', { actor: p.nombre })}</option>`).join('')
        }</select>` : ''}
        <button class="del-row-remove" data-idx="${i}">×</button>
      </div>`).join('');
  }

  function bindRowEvents() {
    wrapper.querySelectorAll('#start-rows [data-field]').forEach(el => {
      const idx = parseInt(el.dataset.idx), field = el.dataset.field;
      if (el.tagName === 'SELECT') {
        el.addEventListener('change', () => {
          items[idx][field] = field === 'trigger' ? el.value : parseInt(el.value);
          if (field === 'trigger') rebuild();
        });
      } else {
        el.addEventListener('input', () => { items[idx][field] = el.value; });
      }
    });
    wrapper.querySelectorAll('#start-rows .del-row-remove').forEach(btn =>
      btn.addEventListener('click', () => { items.splice(parseInt(btn.dataset.idx), 1); rebuild(); })
    );
  }

  function rebuild() {
    wrapper.querySelector('#start-rows').innerHTML = rowsHtml();
    bindRowEvents();
  }

  wrapper.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble value-bubble">
      <div class="val-header">${t('startHeader')}</div>
      <div class="val-subtitle">${t('startSubtitle')}</div>
      <div id="start-rows">${rowsHtml()}</div>
      <div class="val-add-row" style="margin-top:8px">
        <button class="val-add-btn" id="start-add-btn" style="flex:0 0 auto;font-size:11px;padding:5px 10px">${t('startAddBtn')}</button>
      </div>
      <div class="val-confirm-row">
        <button class="btn-send btn-green" id="btn-start-confirm" style="width:100%">${t('startConfirmBtn')}</button>
      </div>
    </div>`;

  messages.appendChild(wrapper); messages.scrollTop = messages.scrollHeight;
  bindRowEvents();

  wrapper.querySelector('#start-add-btn').addEventListener('click', () => {
    items.push({ nombre: t('defaultStartName'), laneIdx: 0, trigger: 'none', fromIdx: 0 });
    rebuild();
  });
  wrapper.querySelector('#btn-start-confirm').addEventListener('click', () => {
    disableCard(wrapper);
    handleConfirmStarts(items);
  });
}

// ─── TARJETA SIGUIENTE PASO (asistente paso a paso) ──────────────────────────
/**
 * Convierte la sugerencia cruda del LLM (suggestion = { tipo, nombre, lane, actorExterno })
 * en el formato interno usado por handleConfirmStep/handleConfirmBranchStep.
 * Si se pasa allowedTipos y suggestion.tipo no está en esa lista (p.ej. un
 * gateway sugerido dentro de una rama), se sanea al primer tipo permitido.
 */
function suggestionToStepData(suggestion, allowedTipos) {
  const lanes = effectiveLanes();
  const ext   = confirmedStructure.poolExterno || [];
  const isMsgTipo = t => t === 'sendTask' || t === 'intermediateThrowEvent' || t === 'endMessageEvent';

  let tipoVal = suggestion.tipo;
  if (allowedTipos && !allowedTipos.includes(tipoVal)) tipoVal = allowedTipos[0];

  return {
    tipo:    tipoVal,
    nombre:  suggestion.nombre || t('defaultStepName'),
    laneIdx: Math.max(0, lanes.indexOf(suggestion.lane)),
    participantIdx: (ext.length > 0 && isMsgTipo(tipoVal))
      ? Math.max(0, ext.findIndex(p => p.nombre === suggestion.actorExterno))
      : undefined
  };
}

/**
 * Muestra la tarjeta para confirmar/editar el siguiente paso del proceso.
 * suggestion = { tipo, nombre, lane, actorExterno }
 */
function showNextStepCard(suggestion, stepNum, esFinal, branchCtx) {
  const messages = document.getElementById('ai-messages');
  const old = document.getElementById('next-step-card'); if (old) old.remove();

  const lanes = effectiveLanes();
  const ext   = confirmedStructure.poolExterno || [];
  const isMsgTipo = t => t === 'sendTask' || t === 'intermediateThrowEvent' || t === 'endMessageEvent';
  const isGwTipo  = t => t === 'exclusiveGateway' || t === 'parallelGateway';
  const isEndMsgTipo = t => t === 'endMessageEvent';
  const inBranch  = !!branchCtx;

  // Dentro de una rama no se permiten gateways anidados
  const tipos = inBranch
    ? ['task','sendTask','intermediateCatchEvent','intermediateThrowEvent','compensationEvent','timerEvent','endMessageEvent']
    : ['task','sendTask','exclusiveGateway','parallelGateway','intermediateCatchEvent','intermediateThrowEvent','compensationEvent','timerEvent','endMessageEvent'];
  const TIPOS_HTML = tipos
    .map(t => `<option value="${t}"${t===suggestion.tipo?' selected':''}>${elementIcon(t)} ${elementLabel(t)}</option>`).join('');

  const laneIdx  = Math.max(0, lanes.indexOf(suggestion.lane));
  const actorIdx = ext.length > 0 ? Math.max(0, ext.findIndex(p => p.nombre === suggestion.actorExterno)) : 0;

  const wrapper = document.createElement('div');
  wrapper.className = 'msg ai'; wrapper.id = 'next-step-card';

  const header   = inBranch ? t('stepHeaderBranch', { branch: branchCtx.branchNombre, n: stepNum }) : t('stepHeaderMain', { n: stepNum });
  const subtitle = inBranch
    ? t('stepSubtitleBranch', { branch: branchCtx.branchNombre, gateway: branchCtx.gatewayNombre })
    : t('stepSubtitleMain');
  const finalLbl = inBranch ? t('stepFinalBranch') : t('stepFinalMain');

  wrapper.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble value-bubble">
      <div class="val-header">${header}</div>
      <div class="val-subtitle">${subtitle}</div>
      <div class="del-row">
        <select class="del-lane-sel" id="step-tipo">${TIPOS_HTML}</select>
        <input type="text" class="val-desc-input del-name-input" id="step-nombre"
          value="${(suggestion.nombre||'').replace(/"/g,'&quot;')}" style="flex:1">
        <select class="del-lane-sel" id="step-lane">${
          lanes.map((l, li) => `<option value="${li}"${li===laneIdx?' selected':''}>${l}</option>`).join('')
        }</select>
      </div>
      <div id="step-actor-row" class="del-row" style="margin-top:6px;display:${ext.length > 0 && isMsgTipo(suggestion.tipo) ? 'flex' : 'none'}">
        <span class="del-chip-icon">📨</span>
        <span class="del-chip-name" style="flex:0 0 auto">${t('stepRecipient')}</span>
        <select class="del-lane-sel" id="step-actor">${
          ext.map((p, pi) => `<option value="${pi}"${pi===actorIdx?' selected':''}>${p.nombre}</option>`).join('')
        }</select>
      </div>
      <div class="val-add-row" id="step-final-row" style="margin-top:10px;display:${(!inBranch && isGwTipo(suggestion.tipo)) || isEndMsgTipo(suggestion.tipo) ? 'none' : 'flex'}">
        <label style="font-size:11px;color:#bae6fd;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="step-final"${esFinal ? ' checked' : ''}>
          ${finalLbl}
        </label>
      </div>
      ${inBranch ? `
      <div class="val-add-row" id="step-endproc-row" style="margin-top:4px;display:${esFinal && !isEndMsgTipo(suggestion.tipo) ? 'flex' : 'none'}">
        <label style="font-size:11px;color:#fca5a5;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="step-end-process"${branchCtx.terminaProceso ? ' checked' : ''}>
          ${t('stepEndProcessLabel')}
        </label>
      </div>` : ''}
      <div class="val-confirm-row">
        <button class="btn-send btn-green" id="btn-step-confirm" style="width:100%"></button>
      </div>
    </div>`;

  messages.appendChild(wrapper); messages.scrollTop = messages.scrollHeight;

  const tipoSel    = wrapper.querySelector('#step-tipo');
  const actorRow   = wrapper.querySelector('#step-actor-row');
  const finalRow   = wrapper.querySelector('#step-final-row');
  const finalChk   = wrapper.querySelector('#step-final');
  const endProcRow = wrapper.querySelector('#step-endproc-row');
  const confirmBtn = wrapper.querySelector('#btn-step-confirm');

  function refreshBtn() {
    if (!inBranch && isGwTipo(tipoSel.value)) { confirmBtn.textContent = t('btnConfirmDefineCases'); return; }
    if (isEndMsgTipo(tipoSel.value)) {
      confirmBtn.textContent = inBranch ? t('btnConfirmCloseCaseMsg') : t('btnConfirmFinishMsg');
      return;
    }
    if (finalChk.checked) confirmBtn.textContent = inBranch ? t('btnConfirmCloseCase') : t('btnConfirmFinish');
    else confirmBtn.textContent = t('btnConfirmContinue');
  }
  refreshBtn();

  tipoSel.addEventListener('change', () => {
    actorRow.style.display = (ext.length > 0 && isMsgTipo(tipoSel.value)) ? 'flex' : 'none';
    // Para gateways la continuación la deciden sus ramas; un "Fin con mensaje"
    // termina el paso/rama por sí mismo: en ambos casos se oculta el checkbox.
    const hideFinal = (!inBranch && isGwTipo(tipoSel.value)) || isEndMsgTipo(tipoSel.value);
    finalRow.style.display = hideFinal ? 'none' : 'flex';
    if (endProcRow) endProcRow.style.display = (!hideFinal && finalChk.checked) ? 'flex' : 'none';
    refreshBtn();
  });
  finalChk.addEventListener('change', () => {
    if (endProcRow) endProcRow.style.display = finalChk.checked ? 'flex' : 'none';
    refreshBtn();
  });

  confirmBtn.addEventListener('click', () => {
    const tipoVal  = tipoSel.value;
    const isEndMsg = isEndMsgTipo(tipoVal);
    const stepData = {
      tipo:    tipoVal,
      nombre:  wrapper.querySelector('#step-nombre').value.trim() || t('defaultStepName'),
      laneIdx: parseInt(wrapper.querySelector('#step-lane').value),
      participantIdx: (ext.length > 0 && isMsgTipo(tipoVal))
        ? parseInt(wrapper.querySelector('#step-actor').value)
        : undefined
    };
    disableCard(wrapper);
    if (inBranch) {
      const fin     = isEndMsg ? true : finalChk.checked;
      const termina = isEndMsg ? true : (fin && !!wrapper.querySelector('#step-end-process')?.checked);
      branchCtx.onConfirm(stepData, fin, termina);
    } else {
      handleConfirmStep(stepData, isGwTipo(tipoVal) ? false : (isEndMsg ? true : finalChk.checked));
    }
  });
}

// ─── TARJETA CASOS DE GATEWAY ────────────────────────────────────────────────
/**
 * Muestra la tarjeta para definir/editar los casos (ramas) de un gateway.
 * casos = ['Hay stock', 'Sin stock', ...] (mínimo 2)
 */
function showBranchesCard(gatewayStep, casos) {
  const messages = document.getElementById('ai-messages');
  const old = document.getElementById('branches-card'); if (old) old.remove();

  const items = casos.slice();
  const wrapper = document.createElement('div');
  wrapper.className = 'msg ai'; wrapper.id = 'branches-card';

  function rowsHtml() {
    return items.map((c, i) => `
      <div class="del-row">
        <span class="del-chip-icon">🔀</span>
        <input type="text" class="val-desc-input del-name-input" data-idx="${i}"
          value="${(c||'').replace(/"/g,'&quot;')}" style="flex:1;min-width:90px">
        <button class="del-row-remove" data-idx="${i}"${items.length <= 2 ? ' disabled style="opacity:0.3"' : ''}>×</button>
      </div>`).join('');
  }
  function bindRowEvents() {
    wrapper.querySelectorAll('#branch-rows input').forEach(el =>
      el.addEventListener('input', () => { items[parseInt(el.dataset.idx)] = el.value; }));
    wrapper.querySelectorAll('#branch-rows .del-row-remove').forEach(btn =>
      btn.addEventListener('click', () => {
        if (items.length <= 2) return;
        items.splice(parseInt(btn.dataset.idx), 1); rebuild();
      }));
  }
  function rebuild() { wrapper.querySelector('#branch-rows').innerHTML = rowsHtml(); bindRowEvents(); }

  wrapper.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble value-bubble">
      <div class="val-header">${t('branchesHeader', { name: gatewayStep.nombre })}</div>
      <div class="val-subtitle">${t('branchesSubtitle')}</div>
      <div id="branch-rows">${rowsHtml()}</div>
      <div class="val-add-row" style="margin-top:8px">
        <button class="val-add-btn" id="branch-add-btn" style="flex:0 0 auto;font-size:11px;padding:5px 10px">${t('branchesAddBtn')}</button>
      </div>
      <div class="val-confirm-row">
        <button class="btn-send btn-green" id="btn-branches-confirm" style="width:100%">${t('branchesConfirmBtn')}</button>
      </div>
    </div>`;

  messages.appendChild(wrapper); messages.scrollTop = messages.scrollHeight;
  bindRowEvents();

  wrapper.querySelector('#branch-add-btn').addEventListener('click', () => {
    items.push(t('defaultCaseName', { n: items.length + 1 }));
    rebuild();
  });
  wrapper.querySelector('#btn-branches-confirm').addEventListener('click', () => {
    const clean = items.map(s => (s || '').trim()).filter(Boolean);
    if (clean.length < 2) return;
    disableCard(wrapper);
    handleConfirmBranches(gatewayStep, clean);
  });
}

function disableCard(div) {
  div.querySelectorAll('button, textarea, input, select').forEach(el => {
    el.disabled = true; el.style.opacity = '0.4'; el.style.cursor = 'default';
  });
}

// ─── LLAMADA A LA API ─────────────────────────────────────────────────────────
// GitHub Models limita las peticiones POR MODELO y día (p.ej. 150/día para
// gpt-4o-mini). Si un modelo agota su cuota (429), se prueba con el siguiente.
const LLM_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'Phi-4', 'Mistral-Nemo'];
let _llmModelIdx = 0; // recuerda el último modelo que funcionó en esta sesión

async function callOpenAI(apiKey, systemPrompt, messages) {
  let lastErr = null;
  for (let k = 0; k < LLM_MODELS.length; k++) {
    const idx   = (_llmModelIdx + k) % LLM_MODELS.length;
    const model = LLM_MODELS[idx];
    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.3,
        max_tokens: 8000
      })
    });
    if (response.ok) {
      _llmModelIdx = idx;
      const data = await response.json();
      return data.choices[0].message.content.trim();
    }
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `Error ${response.status} en la API`;
    if (response.status === 429) {
      console.warn(`Límite alcanzado para "${model}", probando con el siguiente modelo...`);
      lastErr = new Error(msg);
      continue;
    }
    throw new Error(msg);
  }
  throw new Error(`Se agotó la cuota diaria de todos los modelos disponibles. Espera unas horas o usa otro token. Último error: ${lastErr?.message || '?'}`);
}

function callAPI(apiKey, systemPrompt, messages) {
  return callOpenAI(apiKey, systemPrompt, messages);
}

function cleanXML(raw) {
  let xml = raw.replace(/```xml/gi, '').replace(/```bpmn/gi, '').replace(/```/g, '').trim();
  const idx = xml.indexOf('<?xml');
  if (idx > -1) xml = xml.substring(idx);
  if (!xml.startsWith('<?xml')) { const d = xml.indexOf('<definitions'); if (d > -1) xml = xml.substring(d); }

  // ── Reparación 1: comilla de cierre olvidada antes de />
  // El LLM a veces genera: height="36/>  en lugar de  height="36"/>
  // Patrón: ="VALOR/>  →  ="VALOR"/>
  xml = xml.replace(/="([^"<>\n\r]*)\s*\/>/g, '="$1"/>');

  // ── Reparación 2: truncaciones (XML cortado antes de </definitions>)
  if (!xml.includes('</definitions>')) {
    // Recortar hasta el último '>' completo (eliminar tag a medias)
    const lastGt = xml.lastIndexOf('>');
    if (lastGt > 0) xml = xml.substring(0, lastGt + 1);

    const needsPlane = xml.includes('<bpmndi:BPMNPlane') && !xml.includes('</bpmndi:BPMNPlane>');
    const needsDiag  = xml.includes('<bpmndi:BPMNDiagram') && !xml.includes('</bpmndi:BPMNDiagram>');
    if (needsPlane) xml += '\n    </bpmndi:BPMNPlane>';
    if (needsDiag)  xml += '\n  </bpmndi:BPMNDiagram>';
    xml += '\n</definitions>';
  }

  if (!xml.includes('bpmndi:BPMNDiagram') && !xml.includes('BPMNDiagram'))
    throw new Error(t('errNoDiagramSection'));
  return xml;
}

// ─── PASO 1: IDENTIFICAR ESTRUCTURA ──────────────────────────────────────────
async function handleDescribeProcess(description) {
  const apiKey = DEFAULT_API_KEY;

  processDescription = description;
  addTyping();
  try {
    const reply = await callAPI(apiKey, buildStructureSystemPrompt(), [{ role: 'user', content: description }]);
    removeTyping();

    let structure;
    try { const m = reply.match(/\{[\s\S]*\}/); structure = JSON.parse(m ? m[0] : reply); if (!structure.poolPrincipal?.nombre) throw new Error(); }
    catch(e) { addMessage(t('errStructure'), 'ai', 'err'); return; }
    structure.poolPrincipal.lanes = structure.poolPrincipal.lanes || [];

    confirmedStructure = structure;
    await modeler.importXML(buildStructureBPMN(structure));
    container.removeClass('with-error').addClass('with-diagram');

    const lanesArr = structure.poolPrincipal.lanes;
    const lanesTxt = lanesArr.length > 0 ? lanesArr.join(', ') : t('noLanesText');
    const ext   = (structure.poolExterno || []).map(p => p.nombre).join(', ') || t('noneExt');
    const lanesQuestion = lanesArr.length === 0 ? t('lanesQuestionMsg') : '';
    addMessage(t('structDrawnMsg', {
      org: structure.poolPrincipal.nombre,
      lanes: lanesTxt,
      ext,
      resumen: structure.resumen || '',
      lanesQuestion
    }), 'ai');

    showStructureCard(structure);
    fase = 'confirm_structure';
    updateUI();
  } catch(err) { removeTyping(); addMessage(t('errorPrefix', { msg: err.message }), 'ai', 'err'); }
}

// ─── PASO 2A: CONFIRMAR ESTRUCTURA → ELEGIR MODO Y EMPEZAR EL FLUJO ──────────
async function handleConfirmStructure() {
  addMessage(t('structConfirmedUser'), 'user');
  diagramState = { steps: [] };
  processFlowDescription = processDescription;
  showFlowModeCard();
}

/**
 * Tarjeta para elegir cómo se genera el proceso paso a paso:
 * - Paso a paso: el asistente pide confirmación de cada sugerencia (tarjetas).
 * - Automático: el asistente sigue el mismo razonamiento pero auto-confirma
 *   cada sugerencia hasta completar el diagrama (siempre acotado por
 *   MAX_FLOW_STEPS / MAX_BRANCH_STEPS, así que nunca entra en bucle).
 */
function showFlowModeCard() {
  const messages = document.getElementById('ai-messages');
  const old = document.getElementById('flow-mode-card'); if (old) old.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'msg ai'; wrapper.id = 'flow-mode-card';
  wrapper.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble value-bubble">
      <div class="val-header">${t('flowModeHeader')}</div>
      <div class="val-subtitle">${t('flowModeSubtitle')}</div>
      <div class="val-confirm-row">
        <button class="btn-send btn-blue" id="btn-flow-mode-manual" style="width:100%">${t('flowModeManualBtn')}</button>
        <button class="btn-send btn-green" id="btn-flow-mode-auto" style="width:100%;margin-top:8px">${t('flowModeAutoBtn')}</button>
      </div>
    </div>`;

  messages.appendChild(wrapper); messages.scrollTop = messages.scrollHeight;

  wrapper.querySelector('#btn-flow-mode-manual').addEventListener('click', () => {
    disableCard(wrapper);
    autoGenerateAll = false;
    addMessage(t('flowModeManualChosen'), 'user');
    startFlowStartPhase();
  });
  wrapper.querySelector('#btn-flow-mode-auto').addEventListener('click', () => {
    disableCard(wrapper);
    autoGenerateAll = true;
    addMessage(t('flowModeAutoChosen'), 'user');
    startFlowStartPhase();
  });
}

// ─── PASO 2B: MODIFICAR ESTRUCTURA ───────────────────────────────────────────
async function handleModifyStructure(modification) {
  const apiKey = DEFAULT_API_KEY;

  addTyping();
  try {
    const reply = await callAPI(apiKey, buildStructureSystemPrompt(),
      [{ role: 'user', content: buildModifyStructurePrompt(confirmedStructure, modification) }]);
    removeTyping();

    let structure;
    try { const m = reply.match(/\{[\s\S]*\}/); structure = JSON.parse(m ? m[0] : reply); if (!structure.poolPrincipal?.nombre) throw new Error(); }
    catch(e) { addMessage(t('errModify'), 'ai', 'err'); showStructureCard(confirmedStructure); return; }
    structure.poolPrincipal.lanes = structure.poolPrincipal.lanes || [];

    confirmedStructure = structure;
    await modeler.importXML(buildStructureBPMN(structure));
    container.removeClass('with-error').addClass('with-diagram');
    addMessage(t('structUpdated'), 'ai');
    showStructureCard(structure);
    fase = 'confirm_structure'; updateUI();
  } catch(err) { removeTyping(); addMessage(t('errorPrefix', { msg: err.message }), 'ai', 'err'); showStructureCard(confirmedStructure); }
}

// ─── FLUJO PASO A PASO: HELPERS DE TIPO ──────────────────────────────────────
/**
 * Lanes "efectivas" para el asistente y los prompts: si la organización no
 * tiene departamentos (piscina única), se usa el nombre de la organización
 * como única "calle" lógica (laneIdx 0). El render recibe las lanes reales.
 */
function effectiveLanes() {
  const l = confirmedStructure?.poolPrincipal?.lanes || [];
  return l.length > 0 ? l : [confirmedStructure?.poolPrincipal?.nombre || t('defaultOrgName')];
}

function elementIcon(tipo) {
  const icons = {
    task:                   '📋',
    sendTask:               '📤',
    intermediateCatchEvent: '📩',
    intermediateThrowEvent: '📨',
    compensationEvent:      '⏪',
    timerEvent:             '⏱️',
    endMessageEvent:        '✉️',
    exclusiveGateway:       '◇',
    parallelGateway:        '╋',
    startEvent:             '🏁',
    endEvent:               '🔚',
  };
  return icons[tipo] || '📋';
}
function elementLabel(tipo) {
  const keys = {
    task:                   'elTask',
    sendTask:               'elSendTask',
    intermediateCatchEvent: 'elIntermediateCatch',
    intermediateThrowEvent: 'elIntermediateThrow',
    compensationEvent:      'elCompensation',
    timerEvent:             'elTimer',
    endMessageEvent:        'elEndMessage',
    exclusiveGateway:       'elExclusiveGw',
    parallelGateway:        'elParallelGw',
    startEvent:             'elStart',
    endEvent:               'elEnd',
  };
  return t(keys[tipo] || 'elTask');
}

// ─── PASO 3A: INICIO DEL PROCESO ─────────────────────────────────────────────
/**
 * Pide al LLM el/los punto(s) de inicio del proceso y muestra la tarjeta para confirmarlos.
 */
async function startFlowStartPhase() {
  const lanes = effectiveLanes();
  const ext   = (confirmedStructure.poolExterno || []).map(p => p.nombre);

  fase = 'flow_start'; updateUI();
  addMessage(t('searchingStart'), 'ai');
  addTyping();

  let inicios = [];
  try {
    const reply = await callAPI(DEFAULT_API_KEY, bpmnJsonExpertPrompt(),
      [{ role: 'user', content: buildFlowStartPrompt(processFlowDescription, lanes, ext) }]);
    removeTyping();
    const m = reply.match(/\{[\s\S]*\}/);
    const data = JSON.parse(m ? m[0] : reply);
    inicios = Array.isArray(data.inicios) ? data.inicios : [];
  } catch(e) { removeTyping(); addMessage(t('errorPrefix', { msg: e.message }), 'ai', 'err'); inicios = []; }

  if (inicios.length === 0) inicios = [{ lane: lanes[0], nombre: t('defaultStartName'), trigger: 'none', from: null }];

  // El punto de inicio SIEMPRE se pregunta, incluso en modo automático: solo
  // los pasos posteriores (flow_step / branches) se generan sin confirmación.
  showStartCard(inicios);
}

async function handleConfirmStarts(items) {
  const lanes = effectiveLanes();
  const ext   = confirmedStructure.poolExterno || [];

  if (items.length === 0) items = [{ nombre: t('defaultStartName'), laneIdx: 0, trigger: 'none', fromIdx: 0 }];

  const resumen = items.map(it => {
    const trig = it.trigger === 'message' ? t('startTriggerMsg', { actor: ext[it.fromIdx]?.nombre || '?' }) : '';
    return `🏁 ${it.nombre} — ${lanes[it.laneIdx]}${trig}`;
  }).join('<br>');
  addMessage(resumen, 'user');

  items.forEach((it, i) => {
    diagramState.steps.push({
      id: `START_${i}`,
      tipo: 'startEvent',
      nombre: it.nombre,
      laneIdx: it.laneIdx,
      messageTrigger: it.trigger === 'message',
      fromParticipantIdx: it.trigger === 'message' ? it.fromIdx : undefined
    });
  });

  try {
    const xml = renderDiagramFromState(confirmedStructure, diagramState);
    window._lastGeneratedXML = xml;
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
  } catch(err) {
    addMessage(t('errDiagramUpdate', { msg: err.message }), 'ai', 'err'); return;
  }

  addMessage(t('startConfirmedMsg'), 'ai');
  if (autoGenerateAll) addMessage(t('autoModeRunningMsg'), 'ai');
  await startNextStepFlow();
}

// ─── PASO 3B: SIGUIENTE PASO (asistente paso a paso) ─────────────────────────
/**
 * Pide al LLM el siguiente paso del proceso y muestra la tarjeta para confirmarlo.
 */
async function startNextStepFlow() {
  const lanes = effectiveLanes();
  const ext   = (confirmedStructure.poolExterno || []).map(p => p.nombre);
  const mainSteps = diagramState.steps.filter(s => s.tipo !== 'startEvent' && s.tipo !== 'endEvent');
  const stepNum = mainSteps.length + 1;

  fase = 'flow_step'; updateUI();
  addMessage(t('thinkingNextStep', { n: stepNum }), 'ai');
  addTyping();

  let suggestion = { tipo: 'task', nombre: t('defaultNextStepName'), lane: lanes[0], actorExterno: null };
  let esFinal = mainSteps.length >= MAX_FLOW_STEPS;

  if (!esFinal) {
    try {
      const reply = await callAPI(DEFAULT_API_KEY, bpmnJsonExpertPrompt(),
        [{ role: 'user', content: buildNextStepPrompt(processFlowDescription, lanes, ext, diagramState.steps) }]);
      removeTyping();
      const m = reply.match(/\{[\s\S]*\}/);
      const data = JSON.parse(m ? m[0] : reply);
      if (data.siguiente) suggestion = data.siguiente;
      esFinal = !!data.esFinal;
    } catch(e) {
      removeTyping();
      addMessage(t('errorPrefix', { msg: e.message }), 'ai', 'err');
      // No se pudo consultar al LLM: en vez de seguir generando "Siguiente
      // paso" en bucle hasta MAX_FLOW_STEPS, se cierra el diagrama ahora con
      // este último paso de relleno.
      esFinal = true;
    }
  } else {
    removeTyping();
    addMessage(t('limitReachedStep'), 'ai', 'err');
  }

  if (autoGenerateAll) { await handleConfirmStep(suggestionToStepData(suggestion), esFinal); return; }

  showNextStepCard(suggestion, stepNum, esFinal);
}

async function handleConfirmStep(stepData, isFinal) {
  const lanes = effectiveLanes();
  const n = diagramState.steps.filter(s => s.tipo !== 'startEvent' && s.tipo !== 'endEvent').length;
  const isGW     = stepData.tipo === 'exclusiveGateway' || stepData.tipo === 'parallelGateway';
  const isEndMsg = stepData.tipo === 'endMessageEvent';

  // "Fin con mensaje": el propio paso ES el evento de fin (con mensaje y,
  // opcionalmente, destinatario externo) — no se añade una tarea + Fin aparte.
  const step = isEndMsg
    ? { id: 'END_0', tipo: 'endEvent', nombre: stepData.nombre, laneIdx: stepData.laneIdx, participantIdx: stepData.participantIdx, messageTrigger: true }
    : { id: `S_${n}`, tipo: stepData.tipo, nombre: stepData.nombre, laneIdx: stepData.laneIdx, participantIdx: stepData.participantIdx };
  if (isGW) { step.branches = []; isFinal = false; }
  if (isEndMsg) isFinal = true;
  diagramState.steps.push(step);

  let label = `${elementIcon(stepData.tipo)} ${stepData.nombre} (${lanes[stepData.laneIdx]})`;
  if (stepData.participantIdx !== undefined) {
    const ext = confirmedStructure.poolExterno || [];
    label += ` → 📨 ${ext[stepData.participantIdx]?.nombre || ''}`;
  }
  addMessage(label, 'user');

  if (isFinal && !isEndMsg) {
    diagramState.steps.push({ id: 'END_0', tipo: 'endEvent', nombre: t('elEnd'), laneIdx: stepData.laneIdx });
  }

  try {
    const xml = renderDiagramFromState(confirmedStructure, diagramState);
    window._lastGeneratedXML = xml;
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
  } catch(err) {
    addMessage(t('errDiagramUpdate', { msg: err.message }), 'ai', 'err'); return;
  }

  if (isGW) { await startBranchDefinitionPhase(step); return; }

  if (isFinal) {
    fase = 'refine'; updateUI();
    addMessage(t('diagramComplete'), 'ai', 'ok');
  } else {
    await startNextStepFlow();
  }
}

// ─── PASO 3C: RAMAS/CASOS DE UN GATEWAY ──────────────────────────────────────
/**
 * Pide al LLM los casos del gateway y muestra la tarjeta para confirmarlos/editarlos.
 */
async function startBranchDefinitionPhase(gatewayStep) {
  const lanes = effectiveLanes();
  const ext   = (confirmedStructure.poolExterno || []).map(p => p.nombre);

  fase = 'flow_branches'; updateUI();
  addMessage(t('identifyingCases', { name: gatewayStep.nombre }), 'ai');
  addTyping();

  let casos = [];
  try {
    const reply = await callAPI(DEFAULT_API_KEY, bpmnJsonExpertPrompt(),
      [{ role: 'user', content: buildGatewayBranchesPrompt(processFlowDescription, gatewayStep, lanes, ext) }]);
    removeTyping();
    const m = reply.match(/\{[\s\S]*\}/);
    const data = JSON.parse(m ? m[0] : reply);
    casos = Array.isArray(data.casos)
      ? data.casos.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim()).slice(0, 8)
      : [];
  } catch(e) { removeTyping(); addMessage(t('errorPrefix', { msg: e.message }), 'ai', 'err'); }
  if (casos.length < 2) casos = [t('defaultCaseName', { n: 1 }), t('defaultCaseName', { n: 2 })];

  if (autoGenerateAll) { handleConfirmBranches(gatewayStep, casos); return; }

  showBranchesCard(gatewayStep, casos);
}

function handleConfirmBranches(gatewayStep, casos) {
  gatewayStep.branches = casos.map((nombre, i) => ({
    id: `${gatewayStep.id}_B${i}`, nombre, steps: [], endsHere: false
  }));
  addMessage(casos.map(c => `🔀 ${c}`).join('<br>'), 'user');
  startBranchStepFlow(gatewayStep, 0);
}

/**
 * Sub-asistente paso a paso dentro de una rama del gateway.
 */
async function startBranchStepFlow(gatewayStep, branchIdx) {
  const lanes  = effectiveLanes();
  const ext    = (confirmedStructure.poolExterno || []).map(p => p.nombre);
  const branch = gatewayStep.branches[branchIdx];
  const stepNum = branch.steps.length + 1;

  fase = 'flow_branch_step'; updateUI();
  addMessage(t('caseStepThinking', { branch: branch.nombre, i: branchIdx + 1, total: gatewayStep.branches.length, n: stepNum }), 'ai');
  addTyping();

  let suggestion     = { tipo: 'task', nombre: t('defaultNextStepName'), lane: lanes[gatewayStep.laneIdx], actorExterno: null };
  let esFinalRama    = branch.steps.length >= MAX_BRANCH_STEPS;
  let terminaProceso = false;

  if (!esFinalRama) {
    try {
      const reply = await callAPI(DEFAULT_API_KEY, bpmnJsonExpertPrompt(),
        [{ role: 'user', content: buildBranchStepPrompt(processFlowDescription, lanes, ext, gatewayStep, branch) }]);
      removeTyping();
      const m = reply.match(/\{[\s\S]*\}/);
      const data = JSON.parse(m ? m[0] : reply);
      if (data.siguiente) suggestion = data.siguiente;
      esFinalRama    = !!data.esFinalRama;
      terminaProceso = !!data.terminaProceso;
    } catch(e) {
      removeTyping();
      addMessage(t('errorPrefix', { msg: e.message }), 'ai', 'err');
      // No se pudo consultar al LLM: cierra esta rama ahora (convergiendo)
      // en vez de seguir generando pasos de relleno hasta MAX_BRANCH_STEPS.
      esFinalRama = true;
    }
  } else {
    removeTyping();
    addMessage(t('limitReachedBranch'), 'ai', 'err');
  }

  if (autoGenerateAll) {
    const allowedTipos = ['task','sendTask','intermediateCatchEvent','intermediateThrowEvent','compensationEvent','timerEvent','endMessageEvent'];
    const stepData = suggestionToStepData(suggestion, allowedTipos);
    const isEndMsg = stepData.tipo === 'endMessageEvent';
    const fin     = isEndMsg ? true : esFinalRama;
    const termina = isEndMsg ? true : (fin && terminaProceso);
    await handleConfirmBranchStep(gatewayStep, branchIdx, stepData, fin, termina);
    return;
  }

  showNextStepCard(suggestion, stepNum, esFinalRama, {
    gatewayNombre:  gatewayStep.nombre,
    branchNombre:   branch.nombre,
    terminaProceso,
    onConfirm: (stepData, fin, termina) => handleConfirmBranchStep(gatewayStep, branchIdx, stepData, fin, termina)
  });
}

async function handleConfirmBranchStep(gatewayStep, branchIdx, stepData, esFinalRama, terminaProceso) {
  const lanes  = effectiveLanes();
  const branch = gatewayStep.branches[branchIdx];
  const isEndMsg = stepData.tipo === 'endMessageEvent';

  if (isEndMsg) {
    // "Fin con mensaje" dentro de una rama: el propio paso es el evento de
    // fin de esa rama (con mensaje y, opcionalmente, destinatario externo).
    branch.steps.push({ id: `${branch.id}_END`, tipo: 'endEvent', nombre: stepData.nombre, laneIdx: stepData.laneIdx, participantIdx: stepData.participantIdx, messageTrigger: true });
    branch.endsHere = true;
    esFinalRama = true; terminaProceso = true;
  } else {
    branch.steps.push({
      id: `${branch.id}_${branch.steps.length}`,
      tipo: stepData.tipo,
      nombre: stepData.nombre,
      laneIdx: stepData.laneIdx,
      participantIdx: stepData.participantIdx
    });
    if (esFinalRama && terminaProceso) {
      branch.endsHere = true;
      branch.steps.push({ id: `${branch.id}_END`, tipo: 'endEvent', nombre: t('elEnd'), laneIdx: stepData.laneIdx });
    }
  }

  let label = `${elementIcon(stepData.tipo)} [${branch.nombre}] ${stepData.nombre} (${lanes[stepData.laneIdx]})`;
  if (stepData.participantIdx !== undefined) {
    const ext = confirmedStructure.poolExterno || [];
    label += ` → 📨 ${ext[stepData.participantIdx]?.nombre || ''}`;
  }
  addMessage(label, 'user');

  try {
    const xml = renderDiagramFromState(confirmedStructure, diagramState);
    window._lastGeneratedXML = xml;
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
  } catch(err) {
    addMessage(t('errDiagramUpdate', { msg: err.message }), 'ai', 'err'); return;
  }

  if (!esFinalRama) { await startBranchStepFlow(gatewayStep, branchIdx); return; }

  if (branchIdx + 1 < gatewayStep.branches.length) {
    await startBranchStepFlow(gatewayStep, branchIdx + 1);
  } else {
    await finishBranches(gatewayStep);
  }
}

/**
 * Cierre del gateway: crea el join si alguna rama converge y decide cómo continúa el asistente.
 */
async function finishBranches(gatewayStep) {
  const converge = gatewayStep.branches.some(b => !b.endsHere);
  if (converge) {
    gatewayStep.join = { id: `${gatewayStep.id}_JOIN`, tipo: gatewayStep.tipo, nombre: '', laneIdx: gatewayStep.laneIdx };
  }

  try {
    const xml = renderDiagramFromState(confirmedStructure, diagramState);
    window._lastGeneratedXML = xml;
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
  } catch(err) {
    addMessage(t('errDiagramUpdate', { msg: err.message }), 'ai', 'err'); return;
  }

  if (converge) {
    addMessage(t('casesCompletedConverge', { name: gatewayStep.nombre }), 'ai');
    await startNextStepFlow();
  } else {
    fase = 'refine'; updateUI();
    addMessage(t('diagramCompleteAllBranches'), 'ai', 'ok');
  }
}

// ─── PASO 4: REFINAMIENTO (LLM para modificaciones textuales) ───────────────
function buildRefinementSystemPrompt() {
  return `Eres un experto BPMN 2.0. Modifica el diagrama según la instrucción del usuario.
Devuelve SOLO XML válido completo (desde <?xml hasta </definitions>), sin texto ni markdown.
Mantén todos los pools, lanes, sendTasks y messageFlows existentes.
Añade o modifica solo lo que el usuario pida.${langDirective()}`;
}

async function handleRefine(instruction) {
  const apiKey = DEFAULT_API_KEY;

  const sendBtn = document.getElementById('ai-send'); sendBtn.disabled = true;
  addTyping();
  try {
    // Usamos el XML programático como base (evitamos el prefijo bpmn: de modeler.saveXML)
    const currentXML = renderDiagramFromState(confirmedStructure, diagramState);
    const rawXML = await callAPI(apiKey, buildRefinementSystemPrompt(),
      [{ role: 'user', content: `Diagrama actual:\n${currentXML}\n\nModificación: "${instruction}"` }]);
    removeTyping();
    const xml = cleanXML(rawXML);
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
    addMessage(t('diagramModified'), 'ai', 'ok');
  } catch(err) { removeTyping(); addMessage(t('errorPrefix', { msg: err.message }), 'ai', 'err'); }
  finally { sendBtn.disabled = false; updateUI(); }
}

// ─── DISPATCHER ──────────────────────────────────────────────────────────────
async function handleSend() {
  const apiKey  = DEFAULT_API_KEY;
  const input   = document.getElementById('ai-scenario').value.trim();
  const sendBtn = document.getElementById('ai-send');

  if (fase === 'describe') {
    if (!input) return;
    addMessage(input, 'user'); document.getElementById('ai-scenario').value = '';
    sendBtn.disabled = true; await handleDescribeProcess(input); sendBtn.disabled = false;
  } else if (fase === 'confirm_structure') {
    if (!input) return;
    addMessage(input, 'user'); document.getElementById('ai-scenario').value = '';
    sendBtn.disabled = true; await handleModifyStructure(input); sendBtn.disabled = false;
  } else if (fase === 'refine') {
    if (!input) return;
    addMessage(input, 'user'); document.getElementById('ai-scenario').value = '';
    sendBtn.disabled = true; await handleRefine(input); sendBtn.disabled = false;
  } else {
    // Fases de flujo paso a paso: Ctrl+Enter añade información extra
    handleAddInfo();
  }
}

/** Permite añadir información extra (olvidada) en cualquier momento durante el flujo paso a paso. */
function handleAddInfo() {
  const ta  = document.getElementById('ai-scenario');
  const val = ta.value.trim();
  if (!val) { ta.focus(); return; }
  addMessage(val, 'user');
  processFlowDescription = (processFlowDescription ? processFlowDescription + '\n' : '') + val;
  ta.value = '';
  addMessage(t('addInfoConfirmedMsg'), 'ai', 'ok');
}

// ─── PERVAL: selección de actor → análisis ───────────────────────────────────
/**
 * clientActors: actores externos con rol "cliente" (destinatarios del valor) → opción principal.
 * collaboratorActors: resto de actores externos (pasarela de pago, transportista...) → opción secundaria.
 */
function showPervalActorSelect(clientActors, collaboratorActors, onSelect) {
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = 'msg ai';

  const clientBtns = clientActors.map(a =>
    `<button class="opt-btn perval-actor-btn" data-actor="${a}">🧑‍💼 ${a}</button>`
  ).join('');
  const collabBtns = collaboratorActors.map(a =>
    `<button class="opt-btn perval-actor-btn" data-actor="${a}">🤝 ${a}</button>`
  ).join('');

  div.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble question-bubble">
      <div class="question-text">${t('pervalActorQuestion')}</div>
      <div class="options-grid">
        ${clientBtns}
        <button class="opt-btn" id="perval-todos">${t('pervalAllActors')}</button>
      </div>
      ${collabBtns ? `
      <div class="val-subtitle" style="margin-top:8px">${t('pervalOtherCollabs')}</div>
      <div class="options-grid">${collabBtns}</div>` : ''}
    </div>`;

  messages.appendChild(div); messages.scrollTop = messages.scrollHeight;

  div.querySelectorAll('.perval-actor-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      div.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });
      addMessage(btn.dataset.actor, 'user');
      onSelect(btn.dataset.actor);
    });
  });
  div.querySelector('#perval-todos').addEventListener('click', () => {
    div.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });
    addMessage(t('pervalAllActorsUserMsg'), 'user');
    onSelect(null);
  });
}

async function runPervalAnalysis(apiKey, actorName) {
  const pervalBtn = document.getElementById('ai-perval-btn');
  pervalBtn.disabled = true;
  addTyping();
  addMessage(t('calculatingPerval', { forActor: actorName ? t('forActorSuffix', { actor: actorName }) : '' }), 'ai');

  try {
    const { xml: currentXML } = await modeler.saveXML({ format: true });

    // El valor se calcula sobre lo que la empresa ENTREGA/COMUNICA AL CLIENTE
    // (mensajes salientes hacia el participante externo con rol "cliente"),
    // no sobre todas las tareas internas del proceso.
    let scope = 'entregas';
    let tasks = extractClientDeliverablesFromXML(currentXML, confirmedStructure);
    if (tasks.length === 0) {
      scope = 'tareas';
      tasks = extractTasksFromXML(currentXML);
    }
    if (tasks.length === 0) { removeTyping(); addMessage(t('noElementsToAnalyze'), 'ai', 'err'); return; }

    const systemPrompt = buildPervalSystemPrompt(actorName, scope);
    const rawResponse  = await callAPI(apiKey, systemPrompt,
      [{ role: 'user', content: buildPervalUserMessage(currentXML, tasks, actorName, scope) }]);
    removeTyping();

    let data;
    try { const m = rawResponse.match(/\{[\s\S]*\}/); data = JSON.parse(m ? m[0] : rawResponse); }
    catch(e) { addMessage(t('pervalParseError'), 'ai', 'err'); return; }

    showPervalResults(data, actorName);
    pervalAnalisado = true;
  } catch(err) { removeTyping(); addMessage(t('pervalError', { msg: err.message }), 'ai', 'err'); }
  finally { pervalBtn.disabled = false; updateUI(); }
}

async function analyzePerval() {
  const apiKey = DEFAULT_API_KEY;

  const ext = confirmedStructure?.poolExterno || [];
  const clientActors       = ext.filter(p => p.rol === 'cliente').map(p => p.nombre);
  const collaboratorActors = ext.filter(p => p.rol !== 'cliente').map(p => p.nombre);

  if (ext.length > 0) {
    showPervalActorSelect(clientActors, collaboratorActors, actorName => runPervalAnalysis(apiKey, actorName));
  } else {
    runPervalAnalysis(apiKey, null);
  }
}

// ─── PERVAL helpers ───────────────────────────────────────────────────────────
function extractTasksFromXML(xml) {
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'text/xml');
    const ns     = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
    const types  = ['task','userTask','serviceTask','sendTask','receiveTask','manualTask','scriptTask','businessRuleTask'];
    const tasks  = [];
    types.forEach(type => {
      Array.from(doc.getElementsByTagNameNS(ns, type)).forEach(el => {
        const name = el.getAttribute('name');
        if (name && name.trim()) tasks.push(name.trim());
      });
    });
    return [...new Set(tasks)];
  } catch(e) { return []; }
}

function buildPervalSystemPrompt(actorName, scope) {
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

function buildPervalUserMessage(xml, tasks, actorName, scope) {
  const actorLine = actorName ? `\nActor a analizar: ${actorName}` : '';
  const header = scope === 'entregas' ? 'ENTREGAS/COMUNICACIONES DE LA EMPRESA AL CLIENTE:' : 'TAREAS DEL PROCESO:';
  return `${header}${actorLine}\n${tasks.map((t,i)=>`${i+1}. ${t}`).join('\n')}\n\nXML BPMN:\n${xml}`;
}

// Extrae los nombres de los elementos del proceso que envían algo al participante
// externo "cliente" (o, si ninguno está marcado como tal, a cualquier participante
// externo), localizando los <messageFlow> cuyo targetRef apunta a ese participante.
function extractClientDeliverablesFromXML(xml, structure) {
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'text/xml');
    const ns     = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

    const ext = (structure && structure.poolExterno) || [];
    if (ext.length === 0) return [];

    let clientIds = ext
      .map((p, i) => ({ rol: p.rol, id: `Part_Ext${i+1}` }))
      .filter(p => p.rol === 'cliente')
      .map(p => p.id);

    // Si ningún participante externo está marcado como "cliente", se consideran
    // destinatarios del valor todos los participantes externos.
    if (clientIds.length === 0) clientIds = ext.map((_, i) => `Part_Ext${i+1}`);

    const byId = {};
    Array.from(doc.getElementsByTagName('*')).forEach(el => {
      const id = el.getAttribute('id');
      if (id) byId[id] = el;
    });

    const names = [];
    Array.from(doc.getElementsByTagNameNS(ns, 'messageFlow')).forEach(flow => {
      const target = flow.getAttribute('targetRef');
      const source = flow.getAttribute('sourceRef');
      if (!target || !clientIds.includes(target)) return;
      const srcEl = source && byId[source];
      const name = srcEl && srcEl.getAttribute('name');
      if (name && name.trim()) names.push(name.trim());
    });
    return [...new Set(names)];
  } catch(e) { return []; }
}

// Paleta PERVAL: una identidad de color por dimensión, compartida entre los
// badges del chat (rgba translúcido sobre fondo oscuro) y el coloreado de
// las figuras del diagrama (hex sólido, requerido por modeling.setColor).
const PERVAL_DIM = {
  Quality:   { icon:'🔵', label:'Calidad',   text:'#93c5fd', diagram:{ fill:'#dbeafe', stroke:'#3b82f6' } },
  Price:     { icon:'🟢', label:'Precio',    text:'#86efac', diagram:{ fill:'#dcfce7', stroke:'#22c55e' } },
  Emotional: { icon:'🟠', label:'Emocional', text:'#fdba74', diagram:{ fill:'#ffedd5', stroke:'#f97316' } },
  Social:    { icon:'🟣', label:'Social',    text:'#d8b4fe', diagram:{ fill:'#f3e8ff', stroke:'#a855f7' } },
  Interno:   { icon:'⚪', label:'Interno',   text:'#9ca3af', diagram:{ fill:'#f3f4f6', stroke:'#9ca3af' } }
};
function pervalRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const PERVAL_DIM_LABEL_KEYS = {
  Quality: 'dimQuality', Price: 'dimPrice', Emotional: 'dimEmotional', Social: 'dimSocial', Interno: 'dimInterno'
};

function showPervalResults(data, actorName) {
  const dim = {};
  Object.entries(PERVAL_DIM).forEach(([k,c]) => {
    dim[k] = { ...c, label: t(PERVAL_DIM_LABEL_KEYS[k]), bg: pervalRgba(c.diagram.stroke, 0.15), border: pervalRgba(c.diagram.stroke, 0.35) };
  });
  const taskRows = (data.tareas||[]).map(t => {
    const badges = (t.dimensiones||[]).map(d => { const c=dim[d]||dim.Interno; return`<span class="pv-badge" style="background:${c.bg};border:1px solid ${c.border};color:${c.text}">${c.icon} ${c.label}</span>`; }).join('');
    return`<div class="pv-row"><div class="pv-name">${t.nombre}</div><div class="pv-badges">${badges}</div><div class="pv-desc">${t.valor||''}</div></div>`;
  }).join('');
  const summaryCards = Object.entries(data.resumen||{}).map(([d,text]) => { const c=dim[d]||dim.Interno; return`<div class="pv-sum-card" style="background:${c.bg};border:1px solid ${c.border}"><div class="pv-sum-title" style="color:${c.text}">${c.icon} ${c.label}</div><div class="pv-sum-text">${text}</div></div>`; }).join('');
  const generalHtml = data.valorGeneral ? `<div class="pv-general"><span class="pv-general-lbl">${t('pervalGlobalLbl')}${actorName ? ` · ${actorName}` : ''} · </span>${data.valorGeneral}</div>` : '';

  const hasTasks = (data.tareas||[]).length > 0;
  const legendChips = Object.values(dim).map(c =>
    `<span class="pv-legend-chip" style="background:${c.diagram.fill};border:1px solid ${c.diagram.stroke}">${c.icon} ${c.label}</span>`
  ).join('');
  const colorActions = hasTasks ? `
    <div class="pv-actions">
      <div class="pv-legend">${legendChips}</div>
      <div class="val-confirm-row" style="display:flex;gap:6px;margin-top:8px">
        <button class="btn-send btn-green" id="pv-apply-colors" style="flex:1">${t('pervalPaintBtn')}</button>
        <button class="btn-send" id="pv-clear-colors" style="flex:0 0 auto;background:rgba(255,255,255,0.08)">${t('pervalRemoveBtn')}</button>
      </div>
    </div>` : '';

  const html = `<div class="pv-results"><div class="pv-header">${t('pervalHeader')}${actorName ? ` — ${actorName}` : ''}</div><div class="pv-section-lbl">${t('pervalClassifByTask')}</div><div class="pv-tasks">${taskRows}</div><div class="pv-section-lbl" style="margin-top:10px">${t('pervalSummaryByDim')}</div><div class="pv-summary">${summaryCards}</div>${generalHtml}${colorActions}</div>`;
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div'); div.className = 'msg ai';
  div.innerHTML = `<div class="msg-av">🤖</div><div class="msg-bubble pv-bubble">${html}</div>`;
  messages.appendChild(div); messages.scrollTop = messages.scrollHeight;

  if (hasTasks) {
    div.querySelector('#pv-apply-colors').addEventListener('click', () => applyPervalColors(data.tareas, dim));
    div.querySelector('#pv-clear-colors').addEventListener('click', () => clearPervalColors(data.tareas));
  }
}

// ─── PERVAL: pintar el diagrama con los colores de cada dimensión ───────────
function findElementsByName(nombre) {
  const elementRegistry = modeler.get('elementRegistry');
  const target = (nombre || '').trim();
  return elementRegistry.filter(el =>
    el.businessObject && !el.labelTarget && (el.businessObject.name || '').trim() === target
  );
}

// IDs de las anotaciones de texto creadas al "pintar" el diagrama por valor,
// para poder eliminarlas de nuevo con "↩️ Quitar".
let _pervalAnnotationIds = [];

function applyPervalColors(tareas, dim) {
  const modeling = modeler.get('modeling');
  clearPervalAnnotations();
  (tareas || []).forEach(t => {
    const dimKey = (t.dimensiones || [])[0] || 'Interno';
    const c = dim[dimKey] || dim.Interno;
    const els = findElementsByName(t.nombre);
    if (!els.length) return;
    modeling.setColor(els, { fill: c.diagram.fill, stroke: c.diagram.stroke });
    if (t.valor) {
      const annotation = createPervalAnnotation(els[0], t.valor, c.diagram);
      if (annotation) _pervalAnnotationIds.push(annotation.id);
    }
  });
}

function clearPervalColors(tareas) {
  const modeling = modeler.get('modeling');
  (tareas || []).forEach(t => {
    const els = findElementsByName(t.nombre);
    if (els.length) modeling.setColor(els, { fill: null, stroke: null });
  });
  clearPervalAnnotations();
}

// Crea una bpmn:TextAnnotation con el texto de valor mostrado en el chat,
// asociada (bpmn:Association) al elemento correspondiente del diagrama.
function createPervalAnnotation(el, text, color) {
  const modeling      = modeler.get('modeling');
  const bpmnFactory   = modeler.get('bpmnFactory');

  const len    = (text || '').length;
  const width  = Math.min(220, Math.max(120, Math.ceil(len / 3) * 6));
  const lines  = Math.max(1, Math.ceil(len / 40));
  const height = Math.max(40, lines * 18 + 14);

  const businessObject = bpmnFactory.create('bpmn:TextAnnotation', { text: text });
  const position = { x: el.x + el.width / 2, y: el.y - height / 2 - 40 };

  let annotation;
  try {
    annotation = modeling.createShape(
      { type: 'bpmn:TextAnnotation', businessObject: businessObject, width: width, height: height },
      position,
      el.parent
    );
    if (color) modeling.setColor([annotation], { fill: color.fill, stroke: color.stroke });
    modeling.connect(el, annotation, { type: 'bpmn:Association' });
  } catch(e) { return null; }
  return annotation;
}

function clearPervalAnnotations() {
  if (!_pervalAnnotationIds.length) return;
  const elementRegistry = modeler.get('elementRegistry');
  const modeling = modeler.get('modeling');
  const els = _pervalAnnotationIds.map(id => elementRegistry.get(id)).filter(Boolean);
  if (els.length) modeling.removeElements(els);
  _pervalAnnotationIds = [];
}

// ─── Dictado por voz (Web Speech API) ────────────────────────────────────────
function setupVoiceInput() {
  const micBtn   = document.getElementById('ai-mic');
  const textarea = document.getElementById('ai-scenario');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = t('micUnavailable');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = recognitionLang();
  recognition.continuous = true;
  recognition.interimResults = true;

  let listening = false;
  let baseText = '';
  let finalTranscript = '';

  recognition.addEventListener('result', (e) => {
    let interimTranscript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalTranscript += transcript;
      else interimTranscript += transcript;
    }
    const sep = baseText && !/\s$/.test(baseText) ? ' ' : '';
    textarea.value = baseText + sep + (finalTranscript + interimTranscript).trim();
  });

  recognition.addEventListener('end', () => {
    listening = false;
    micBtn.classList.remove('recording');
  });

  recognition.addEventListener('error', (e) => {
    listening = false;
    micBtn.classList.remove('recording');
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      addMessage(t('micError', { err: e.error }), 'ai', 'err');
    }
  });

  micBtn.addEventListener('click', () => {
    if (listening) { recognition.stop(); return; }
    baseText = textarea.value;
    finalTranscript = '';
    listening = true;
    micBtn.classList.add('recording');
    recognition.lang = recognitionLang();
    try { recognition.start(); }
    catch(e) { listening = false; micBtn.classList.remove('recording'); }
    textarea.focus();
  });
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
$(function() {
  setupVoiceInput();

  $('#js-create-diagram').click(e => { e.stopPropagation(); e.preventDefault(); createNewDiagram(); });

  var downloadLink    = $('#js-download-diagram');
  var downloadSvgLink = $('#js-download-svg');
  $('.buttons a').click(function(e) { if (!$(this).is('.active')) { e.preventDefault(); e.stopPropagation(); } });

  var exportArtifacts = debounce(async function() {
    try { const { svg } = await modeler.saveSVG(); setEncoded(downloadSvgLink, 'diagram.svg', svg); } catch(e) { setEncoded(downloadSvgLink, 'diagram.svg', null); }
    try { const { xml } = await modeler.saveXML({ format: true }); setEncoded(downloadLink, 'diagram.bpmn', xml); } catch(e) { setEncoded(downloadLink, 'diagram.bpmn', null); }
  }, 500);
  function setEncoded(link, name, data) {
    var enc = encodeURIComponent(data);
    if (data) { link.addClass('active').attr({ href: 'data:application/bpmn20-xml;charset=UTF-8,' + enc, download: name }); }
    else link.removeClass('active');
  }
  modeler.on('commandStack.changed', exportArtifacts);

  const fab   = document.getElementById('ai-fab');
  const panel = document.getElementById('ai-panel');
  fab.addEventListener('click', () => panel.classList.toggle('open'));
  document.getElementById('ai-close').addEventListener('click', () => panel.classList.remove('open'));
  document.getElementById('ai-send').addEventListener('click', handleSend);
  document.getElementById('ai-scenario').addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) handleSend(); });
  document.getElementById('ai-add-info-btn').addEventListener('click', handleAddInfo);

  document.getElementById('btn-confirm-main').addEventListener('click', () => {
    if (fase === 'confirm_structure') handleConfirmStructure();
  });
  document.getElementById('btn-modify-main').addEventListener('click', () => {
    const ta  = document.getElementById('ai-scenario');
    const val = ta.value.trim();
    if (!val) { ta.focus(); return; }
    addMessage(val, 'user'); ta.value = '';
    if (fase === 'confirm_structure') handleModifyStructure(val);
  });
  document.getElementById('ai-perval-btn').addEventListener('click', analyzePerval);

  document.getElementById('ai-reset').addEventListener('click', () => {
    fase = 'describe'; processDescription = ''; processFlowDescription = ''; confirmedStructure = null;
    diagramState = { steps: [] }; pervalAnalisado = false; autoGenerateAll = false;
    document.getElementById('ai-messages').innerHTML = `
      <div class="msg ai"><div class="msg-av">🤖</div><div class="msg-bubble">${t('welcomeReset')}</div></div>`;
    updateUI();
    createNewDiagram();
  });

  document.querySelectorAll('#ai-lang-switch .lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (setLang(btn.dataset.lang)) applyStaticTranslations();
    });
  });

  applyStaticTranslations();
});

// ─── i18n: aplica las traducciones a los textos estáticos del chrome ────────
function applyStaticTranslations() {
  document.documentElement.lang = getLang();

  const subtitle = document.querySelector('.ai-subtitle');
  if (subtitle) subtitle.textContent = t('subtitle');

  const resetBtn = document.getElementById('ai-reset');
  if (resetBtn) resetBtn.title = t('resetTitle');

  const fab = document.getElementById('ai-fab');
  if (fab) fab.title = t('fabTitle');

  const langSwitch = document.getElementById('ai-lang-switch');
  if (langSwitch) langSwitch.title = t('langSwitchTitle');

  const micBtn = document.getElementById('ai-mic');
  if (micBtn && !micBtn.disabled) micBtn.title = t('micTitle');

  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`phase-${i}`);
    if (el) el.textContent = t(`phase${i}`);
  }

  document.querySelectorAll('#ai-lang-switch .lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === getLang());
  });

  const confirmMainBtn = document.getElementById('btn-confirm-main');
  if (confirmMainBtn) confirmMainBtn.textContent = t('btnConfirmMain');
  const modifyMainBtn = document.getElementById('btn-modify-main');
  if (modifyMainBtn) modifyMainBtn.textContent = t('btnModifyMain');

  const messages = document.getElementById('ai-messages');
  if (fase === 'describe' && messages && messages.children.length === 1) {
    const bubble = messages.querySelector('.msg.ai .msg-bubble');
    if (bubble) bubble.innerHTML = t('welcomeInitial');
  }

  updateUI();
}

function debounce(fn, timeout) { var timer; return function() { if (timer) clearTimeout(timer); timer = setTimeout(fn, timeout); }; }
