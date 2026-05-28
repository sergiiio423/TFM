// ─── API KEY ──────────────────────────────────────────────────────────────────
const DEFAULT_API_KEY = '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';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './style.css';

import $ from 'jquery';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import diagramXML from '../resources/newDiagram.bpmn';

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
if (!window.FileList || !window.FileReader) { window.alert('Usa Chrome o Firefox.'); }
else { registerFileDrop(container, openDiagram); }

// ─── ESTADO ───────────────────────────────────────────────────────────────────
// Fases: 'describe' → 'confirm_structure' → 'describe_process' → 'lane_tasks' (xN) → 'actor_delivery' (xM) → 'refine'
var fase = 'describe';
var processDescription     = '';
var processFlowDescription = '';
var confirmedStructure  = null;
var currentActorIdx     = 0;
var currentLaneTaskIdx  = 0;
var _currentLaneTasks   = [];
var diagramState        = { laneTasks: [], sendTasks: [] };
var pervalAnalisado     = false;

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

  textarea.disabled = false;
  btn.disabled      = false;

  // Por defecto muestra el botón principal y oculta los de confirmación
  btn.style.display         = '';
  if (confirmActs) confirmActs.style.display = 'none';

  if (fase === 'describe') {
    btn.textContent = '→ Identificar participantes';
    btn.className   = 'btn-send btn-blue';
    textarea.placeholder = '¿Quiénes participan en tu proceso? Ej: clientes, proveedores, tu empresa y sus departamentos...';
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (hint) hint.textContent = 'Ctrl+Enter para enviar';

  } else if (fase === 'confirm_structure') {
    btn.style.display = 'none';
    if (confirmActs) confirmActs.style.display = 'flex';
    textarea.placeholder = 'Escribe aquí los cambios que quieres aplicar...';
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (hint) hint.textContent = 'Escribe un cambio y pulsa ✏️ Modificar, o confirma directamente';

  } else if (fase === 'describe_process') {
    btn.textContent = '→ Continuar con las tareas';
    btn.className   = 'btn-send btn-blue';
    textarea.placeholder = 'Describe el flujo completo: qué hace cada departamento, decisiones (gateways), mensajes a actores externos...';
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (hint) hint.textContent = 'Describe el proceso con tanto detalle como quieras y pulsa Continuar';

  } else if (fase === 'lane_tasks') {
    btn.style.display = 'none';
    if (confirmActs) confirmActs.style.display = 'flex';
    textarea.placeholder = 'Escribe cambios para las tareas de este departamento...';
    if (pervalBtn) pervalBtn.style.display = 'none';
    if (hint) hint.textContent = 'Edita las tareas en la tarjeta o escribe un cambio aquí';

  } else if (fase === 'actor_delivery') {
    btn.textContent   = '→ Editar en la tarjeta';
    btn.className     = 'btn-send btn-blue';
    btn.disabled      = true;
    textarea.disabled = true;
    textarea.placeholder = 'Usa la tarjeta para confirmar las entregas de este canal...';
    if (pervalBtn) pervalBtn.style.display = 'none';
    const total = (confirmedStructure?.poolExterno || []).length;
    if (hint) hint.textContent = `Actor ${currentActorIdx + 1} de ${total} — confirma las entregas`;

  } else { // refine
    btn.textContent = '✦ Modificar diagrama';
    btn.className   = 'btn-send btn-green';
    textarea.placeholder = 'Ej: Añade un gateway de validación, renombra el lane de logística...';
    if (pervalBtn) {
      pervalBtn.style.display = 'block';
      pervalBtn.textContent   = pervalAnalisado ? '🔄 Re-analizar PERVAL' : '🔍 Analizar valor PERVAL';
    }
    if (hint) hint.textContent = 'Ctrl+Enter para enviar · ↺ para nueva sesión';
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
  "poolExterno": [{"nombre": "nombre del canal o cliente externo"}],
  "poolPrincipal": {
    "nombre": "nombre de la empresa u organización principal",
    "lanes": ["Departamento1", "Departamento2"]
  },
  "resumen": "Una frase resumiendo los participantes"
}

REGLAS:
- poolExterno: canales o actores EXTERNOS (clientes, marketplace, pasarela de pago, transportista, proveedor…). Puede ser []
- poolPrincipal.lanes: departamentos/áreas INTERNAS (Ventas, Logística, Atención al Cliente, Finanzas…). Mínimo 1, máximo 5.
- Nombres concisos: 1-3 palabras`;
}

function buildModifyStructurePrompt(current, mod) {
  return `Estructura actual:\n${JSON.stringify(current, null, 2)}\n\nModificación: "${mod}"\n\nDevuelve ÚNICAMENTE el JSON modificado (mismo formato).`;
}

/**
 * Sugiere las entregas concretas que el proceso envía a UN actor externo.
 * Devuelve JSON: { "entregas": [{ "nombre", "descripcion", "lane" }] }
 * "lane" es el nombre del departamento que realiza la entrega (una de las lanes conocidas).
 */
function buildActorSuggestionsPrompt(actorName, description, lanes) {
  return `Proceso de negocio: "${description}"
Actor externo: "${actorName}"
Departamentos internos: ${lanes.join(', ')}

Lista de 1 a 4 entregas concretas que el proceso ENVÍA a "${actorName}" como resultado del proceso.
Una entrega es algo tangible: confirmación de pedido, factura, número de seguimiento, autorización de pago, etc.
Para cada entrega indica el departamento que la realiza (uno de los departamentos listados).

RESPONDE SOLO con JSON (sin texto adicional):
{"entregas":[{"nombre":"...","descripcion":"...","lane":"${lanes[0]}"}]}`
}

function buildRefinementMessage(instruction, currentXML) {
  return `Diagrama BPMN actual:\n\n${currentXML}\n\nAplica esta modificación y devuelve el XML COMPLETO con la sección bpmndi:BPMNDiagram:\n"${instruction}"`;
}

// ─── GENERACIÓN PROGRAMÁTICA DEL DIAGRAMA ────────────────────────────────────
function renderDiagramFromState(structure, state) {
  const ext   = structure.poolExterno || [];
  const lanes = structure.poolPrincipal.lanes || [];
  const N     = lanes.length;
  const LH    = 180, EH = 160, EG = 20;
  const X0    = 150, DX = 160;

  // Ordered tasks: for each lane → [lane tasks, send tasks], then next lane
  const ordered = [];
  lanes.forEach((_, li) => {
    (state.laneTasks || []).filter(t => t.laneIdx === li)
      .forEach(t => ordered.push({ ...t, kind: 'task' }));
    (state.sendTasks || []).filter(t => t.laneIdx === li)
      .forEach(t => ordered.push({ ...t, kind: 'send' }));
  });
  ordered.forEach((t, i) => { t._x = X0 + i * DX; });
  const endX = X0 + ordered.length * DX;

  // Pool width: enough to fit all elements + margin
  const PW = Math.max(1200, endX + 300);

  const extY   = i => 30 + i * (EH + EG);
  const extCY  = i => extY(i) + EH / 2;
  const mainY  = ext.length > 0 ? 30 + ext.length * (EH + EG) : 30;
  const laneCY = j => mainY + 60 + j * LH + LH / 2;
  const mainH  = N * LH + 60;

  // ── Collaboration ──────────────────────────────────────────────────────
  let col = '';
  ext.forEach((p, i) => {
    col += `    <participant id="Part_Ext${i+1}" name="${p.nombre}" processRef="Proc_Ext${i+1}"/>\n`;
  });
  col += `    <participant id="Part_Main" name="${structure.poolPrincipal.nombre}" processRef="Proc_Main"/>\n`;
  (state.sendTasks || []).forEach(t => {
    col += `    <messageFlow id="MF_${t.id}" name="${t.name}" sourceRef="${t.id}" targetRef="Part_Ext${t.participantIdx+1}"/>\n`;
  });

  // ── External processes ─────────────────────────────────────────────────
  let proc = '';
  ext.forEach((p, i) => { proc += `  <process id="Proc_Ext${i+1}" isExecutable="false"/>\n`; });

  // ── Lane sets ─────────────────────────────────────────────────────────
  let laneSetXml = '';
  lanes.forEach((lane, j) => {
    const refs = ordered.filter(t => t.laneIdx === j)
      .map(t => `        <flowNodeRef>${t.id}</flowNodeRef>`).join('\n');
    const header = j === 0
      ? `        <flowNodeRef>SE_Main</flowNodeRef>\n` + (refs ? refs + '\n' : '') + `        <flowNodeRef>EE_Main</flowNodeRef>`
      : refs;
    laneSetXml += `      <lane id="Lane${j+1}" name="${lane}">\n${header ? header+'\n' : ''}      </lane>\n`;
  });

  // ── Task / gateway / event elements ─────────────────────────────────────
  const taskXml = ordered.map(t => {
    const tipo = t.tipo || (t.kind === 'send' ? 'sendTask' : 'task');
    const n = t.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    if (tipo === 'exclusiveGateway') return `    <exclusiveGateway id="${t.id}" name="${n}"/>`;
    if (tipo === 'parallelGateway')  return `    <parallelGateway  id="${t.id}" name="${n}"/>`;
    if (tipo === 'intermediateCatchEvent')
      return `    <intermediateCatchEvent id="${t.id}" name="${n}"><messageEventDefinition id="MED_${t.id}"/></intermediateCatchEvent>`;
    if (tipo === 'intermediateThrowEvent')
      return `    <intermediateThrowEvent id="${t.id}" name="${n}"><messageEventDefinition id="MED_${t.id}"/></intermediateThrowEvent>`;
    if (tipo === 'sendTask') return `    <sendTask id="${t.id}" name="${n}"/>`;
    return `    <task id="${t.id}" name="${n}"/>`;
  }).join('\n');

  // ── Sequence flows ─────────────────────────────────────────────────────
  const flowNodes = ['SE_Main', ...ordered.map(t => t.id), 'EE_Main'];
  const seqXml = flowNodes.slice(0, -1).map((src, i) =>
    `    <sequenceFlow id="SF_${i}" sourceRef="${src}" targetRef="${flowNodes[i+1]}"/>`
  ).join('\n');

  proc += `\n  <process id="Proc_Main" isExecutable="false">
    <laneSet id="LaneSet_1">
${laneSetXml}    </laneSet>
    <startEvent id="SE_Main" name="Inicio"/>
    <endEvent id="EE_Main" name="Fin"/>
${taskXml ? taskXml+'\n' : ''}${seqXml ? seqXml+'\n' : ''}  </process>`;

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
        <dc:Bounds x="60" y="${mainY+60+j*LH}" width="${PW-30}" height="${LH}"/>
      </bpmndi:BPMNShape>\n`;
  });

  // Start / end events
  shapes += `      <bpmndi:BPMNShape id="Shape_SE" bpmnElement="SE_Main">
        <dc:Bounds x="112" y="${laneCY(0)-18}" width="36" height="36"/>
      </bpmndi:BPMNShape>\n`;
  shapes += `      <bpmndi:BPMNShape id="Shape_EE" bpmnElement="EE_Main">
        <dc:Bounds x="${endX}" y="${laneCY(0)-18}" width="36" height="36"/>
      </bpmndi:BPMNShape>\n`;

  // Task / gateway / event shapes (size depends on tipo)
  ordered.forEach(t => {
    const tipo = t.tipo || (t.kind === 'send' ? 'sendTask' : 'task');
    const isGW = tipo === 'exclusiveGateway' || tipo === 'parallelGateway';
    const isEV = tipo === 'intermediateCatchEvent' || tipo === 'intermediateThrowEvent';
    const w = isGW ? 50 : isEV ? 36 : 100;
    const h = isGW ? 50 : isEV ? 36 : 80;
    const isGateway = isGW;
    shapes += `      <bpmndi:BPMNShape id="Shape_${t.id}" bpmnElement="${t.id}"${isGateway ? ' isMarkerVisible="true"' : ''}>
        <dc:Bounds x="${t._x-w/2}" y="${laneCY(t.laneIdx)-h/2}" width="${w}" height="${h}"/>
      </bpmndi:BPMNShape>\n`;
  });

  // ── DI edges ──────────────────────────────────────────────────────────
  // Center coords for each node (accounts for shape size)
  const cx = id => {
    if (id === 'SE_Main') return 130;
    if (id === 'EE_Main') return endX + 18;
    return ordered.find(t => t.id === id)?._x ?? 0;
  };
  const cy = id => {
    if (id === 'SE_Main' || id === 'EE_Main') return laneCY(0);
    return laneCY(ordered.find(t => t.id === id)?.laneIdx ?? 0);
  };

  // Sequence flow edges
  flowNodes.slice(0, -1).forEach((src, i) => {
    const tgt = flowNodes[i + 1];
    edges += `      <bpmndi:BPMNEdge id="Edge_SF_${i}" bpmnElement="SF_${i}">
        <di:waypoint x="${cx(src)}" y="${cy(src)}"/>
        <di:waypoint x="${cx(tgt)}" y="${cy(tgt)}"/>
      </bpmndi:BPMNEdge>\n`;
  });

  // Message flow edges (sendTasks → external pool)
  (state.sendTasks || []).forEach(t => {
    const srcY = laneCY(t.laneIdx) - 40; // top of sendTask shape
    edges += `      <bpmndi:BPMNEdge id="Edge_MF_${t.id}" bpmnElement="MF_${t.id}">
        <di:waypoint x="${t._x}" y="${srcY}"/>
        <di:waypoint x="${t._x}" y="${extCY(t.participantIdx)}"/>
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

// Alias para la estructura vacía inicial (sin sendTasks aún)
function buildStructureBPMN(structure) {
  return renderDiagramFromState(structure, { sendTasks: [] });
}

// ─── TARJETA ESTRUCTURA ───────────────────────────────────────────────────────
function showStructureCard(structure) {
  const messages = document.getElementById('ai-messages');
  const old = document.getElementById('structure-card'); if (old) old.remove();
  const div = document.createElement('div');
  div.className = 'msg ai'; div.id = 'structure-card';

  const extChips = (structure.poolExterno || []).length > 0
    ? (structure.poolExterno || []).map(p => `<span class="struct-chip ext-chip">👤 ${p.nombre}</span>`).join('')
    : '<span class="struct-chip none-chip">Ninguno</span>';
  const laneChips = (structure.poolPrincipal.lanes || []).map(l => `<span class="struct-chip lane-chip">📋 ${l}</span>`).join('');

  div.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble structure-bubble">
      <div class="struct-row">
        <div class="struct-col">
          <div class="struct-label">CANALES / ACTORES EXTERNOS</div>
          <div class="struct-chips">${extChips}</div>
        </div>
        <div class="struct-col">
          <div class="struct-label">ORGANIZACIÓN PRINCIPAL</div>
          <div class="struct-main-name">🏢 ${structure.poolPrincipal.nombre}</div>
          <div class="struct-label" style="margin-top:8px">DEPARTAMENTOS (LANES)</div>
          <div class="struct-chips">${laneChips}</div>
        </div>
      </div>
    </div>`;

  messages.appendChild(div); messages.scrollTop = messages.scrollHeight;
}

// ─── TARJETA ACTOR (una por cada canal externo, iterativa) ───────────────────
/**
 * Muestra la tarjeta de entregas para el actor actorIdx.
 * suggestions = [{ nombre, descripcion, lane }]
 */
function showActorCard(actorIdx, suggestions) {
  const messages  = document.getElementById('ai-messages');
  const old = document.getElementById('actor-card'); if (old) old.remove();

  const actor     = confirmedStructure.poolExterno[actorIdx];
  const lanes     = confirmedStructure.poolPrincipal.lanes;
  const total     = confirmedStructure.poolExterno.length;
  const laneOpts  = lanes.map((l, i) => `<option value="${i}">${l}</option>`).join('');

  // Estado editable local
  const entregas = (suggestions || []).map(s => ({
    nombre: s.nombre,
    descripcion: s.descripcion || '',
    laneIdx: Math.max(0, lanes.indexOf(s.lane))
  }));

  const wrapper = document.createElement('div');
  wrapper.className = 'msg ai'; wrapper.id = 'actor-card';

  function rowsHtml() {
    if (entregas.length === 0)
      return '<p class="val-empty">Sin entregas. Añade una con el formulario.</p>';
    return entregas.map((e, i) => `
      <div class="del-row">
        <span class="del-chip-icon">📦</span>
        <span class="del-chip-name">${e.nombre}</span>
        <select class="del-lane-sel" data-idx="${i}">${
          lanes.map((l, li) => `<option value="${li}"${li===e.laneIdx?' selected':''}>${l}</option>`).join('')
        }</select>
        <button class="del-row-remove" data-idx="${i}">×</button>
      </div>`).join('');
  }

  function rebuildRows() {
    wrapper.querySelector('#actor-rows').innerHTML = rowsHtml();
  }

  wrapper.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble value-bubble">
      <div class="val-header">👤 ${actor.nombre}
        <span class="val-actor-sub">&nbsp;—&nbsp;actor ${actorIdx+1}/${total}</span>
      </div>
      <div class="val-subtitle">¿Qué entrega el proceso a <b>${actor.nombre}</b>?
        Elige el departamento que realiza cada entrega.</div>
      <div id="actor-rows">${rowsHtml()}</div>
      <div class="val-add-row" style="margin-top:8px">
        <input type="text" class="val-desc-input" id="actor-new-name"
          placeholder="Nombre de la entrega…">
        <select class="del-lane-sel" id="actor-new-lane">${laneOpts}</select>
        <button class="val-add-btn" id="actor-add-btn">+</button>
      </div>
      <div class="val-confirm-row" style="margin-top:12px;gap:8px;display:flex">
        <button class="btn-confirm-struct" id="btn-actor-confirm">
          ${actorIdx < total-1 ? '✅ Confirmar → siguiente actor' : '✅ Confirmar → ver diagrama'}
        </button>
        <button class="btn-modify-struct" id="btn-actor-skip">⏭ Sin entregas</button>
      </div>
    </div>`;

  messages.appendChild(wrapper); messages.scrollTop = messages.scrollHeight;

  // Eventos
  wrapper.addEventListener('change', e => {
    if (e.target.classList.contains('del-lane-sel') && e.target.dataset.idx !== undefined)
      entregas[parseInt(e.target.dataset.idx)].laneIdx = parseInt(e.target.value);
  });
  wrapper.addEventListener('click', e => {
    if (e.target.classList.contains('del-row-remove')) {
      entregas.splice(parseInt(e.target.dataset.idx), 1);
      rebuildRows();
      // Re-bind selects after rebuild
      wrapper.querySelectorAll('.del-lane-sel[data-idx]').forEach(sel => {
        sel.addEventListener('change', ev => {
          entregas[parseInt(ev.target.dataset.idx)].laneIdx = parseInt(ev.target.value);
        });
      });
    }
    if (e.target.id === 'actor-add-btn') {
      const name = wrapper.querySelector('#actor-new-name').value.trim();
      if (!name) return;
      const li = parseInt(wrapper.querySelector('#actor-new-lane').value);
      entregas.push({ nombre: name, descripcion: '', laneIdx: li });
      wrapper.querySelector('#actor-new-name').value = '';
      rebuildRows();
    }
    if (e.target.id === 'btn-actor-confirm') {
      disableCard(wrapper);
      handleConfirmActorDeliveries(actorIdx, entregas);
    }
    if (e.target.id === 'btn-actor-skip') {
      disableCard(wrapper);
      handleConfirmActorDeliveries(actorIdx, []);
    }
  });
  wrapper.querySelector('#actor-new-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') wrapper.querySelector('#actor-add-btn').click();
  });
}

function disableCard(div) {
  div.querySelectorAll('button, textarea, input, select').forEach(el => {
    el.disabled = true; el.style.opacity = '0.4'; el.style.cursor = 'default';
  });
}

// ─── LLAMADA A LA API ─────────────────────────────────────────────────────────
async function callOpenAI(apiKey, systemPrompt, messages) {
  const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.3,
      max_tokens: 8000
    })
  });
  if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message || 'Error en la API de OpenAI'); }
  const data = await response.json();
  return data.choices[0].message.content.trim();
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
    throw new Error('El modelo generó el proceso sin sección de diagrama visual. Pulsa de nuevo para reintentar.');
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
    try { const m = reply.match(/\{[\s\S]*\}/); structure = JSON.parse(m ? m[0] : reply); if (!structure.poolPrincipal?.lanes) throw new Error(); }
    catch(e) { addMessage('❌ No pude identificar la estructura. Prueba con más detalle.', 'ai', 'err'); return; }

    confirmedStructure = structure;
    await modeler.importXML(buildStructureBPMN(structure));
    container.removeClass('with-error').addClass('with-diagram');

    const lanes = structure.poolPrincipal.lanes.join(', ');
    const ext   = (structure.poolExterno || []).map(p => p.nombre).join(', ') || 'ninguno';
    addMessage(`He dibujado la estructura en el lienzo:<br>
      🏢 <b>${structure.poolPrincipal.nombre}</b> → ${lanes}<br>
      👤 Canales externos: <b>${ext}</b><br><br>
      ${structure.resumen || ''}<br><br>
      ¿Es correcta? Confirma para continuar al análisis de qué reciben los canales externos.`, 'ai');

    showStructureCard(structure);
    fase = 'confirm_structure';
    updateUI();
  } catch(err) { removeTyping(); addMessage(`❌ Error: ${err.message}`, 'ai', 'err'); }
}

// ─── PASO 2A: CONFIRMAR ESTRUCTURA → PEDIR DESCRIPCIÓN DEL FLUJO ─────────────
async function handleConfirmStructure() {
  addMessage('Estructura confirmada ✅', 'user');
  diagramState = { laneTasks: [], sendTasks: [] };
  currentLaneTaskIdx = 0;
  processFlowDescription = '';

  const lanes = confirmedStructure.poolPrincipal.lanes.join(', ');
  const ext   = (confirmedStructure.poolExterno || []).map(p => p.nombre).join(', ') || 'ninguno';
  addMessage(
    `Perfecto. Ahora cuéntame cómo funciona el proceso en detalle.<br><br>
     Describe qué hace cada departamento (<b>${lanes}</b>), cómo se comunica con los actores externos (<b>${ext}</b>) y cualquier decisión o gateway que deba aparecer.<br><br>
     Cuanto más detalle des, más preciso será el diagrama.`,
    'ai'
  );
  fase = 'describe_process'; updateUI();
}

async function handleDescribeProcessFlow(description) {
  processFlowDescription = description;
  addMessage(
    `Descripción del flujo recibida ✅ Ahora voy a sugerir las tareas de cada departamento.<br>
     Empezamos con <b>${confirmedStructure.poolPrincipal.lanes[0]}</b>.`,
    'ai'
  );
  await startLaneTaskFlow(0);
}

/**
 * Inicia el flujo para el actor actorIdx: pide sugerencias al LLM y muestra la tarjeta.
 */
async function startActorDeliveryFlow(apiKey, actorIdx) {
  const actor = confirmedStructure.poolExterno[actorIdx];
  const lanes = confirmedStructure.poolPrincipal.lanes;

  addMessage(`👤 <b>${actor.nombre}</b> — buscando entregas...`, 'ai');
  addTyping();
  currentActorIdx = actorIdx;
  fase = 'actor_delivery'; updateUI();

  let suggestions = [];
  try {
    const taskCtx = diagramState.laneTasks.length > 0
      ? diagramState.laneTasks.map(t => `${lanes[t.laneIdx]}: ${t.name}`).join('; ')
      : processDescription;
    const reply = await callAPI(apiKey, 'Eres un experto en e-commerce. Responde SOLO con JSON.',
      [{ role: 'user', content: buildActorSuggestionsPrompt(actor.nombre, taskCtx, lanes) }]);
    removeTyping();
    const m = reply.match(/\{[\s\S]*\}/);
    const data = JSON.parse(m ? m[0] : reply);
    suggestions = Array.isArray(data.entregas) ? data.entregas : [];
  } catch(e) {
    removeTyping();
    suggestions = [];
  }

  showActorCard(actorIdx, suggestions);
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
    try { const m = reply.match(/\{[\s\S]*\}/); structure = JSON.parse(m ? m[0] : reply); if (!structure.poolPrincipal?.lanes) throw new Error(); }
    catch(e) { addMessage('❌ No pude aplicar los cambios. Intenta de nuevo.', 'ai', 'err'); showStructureCard(confirmedStructure); return; }

    confirmedStructure = structure;
    await modeler.importXML(buildStructureBPMN(structure));
    container.removeClass('with-error').addClass('with-diagram');
    addMessage('Estructura actualizada ✅ ¿Está bien ahora?', 'ai');
    showStructureCard(structure);
    fase = 'confirm_structure'; updateUI();
  } catch(err) { removeTyping(); addMessage(`❌ Error: ${err.message}`, 'ai', 'err'); showStructureCard(confirmedStructure); }
}

// ─── LANE TASKS: PROMPT ──────────────────────────────────────────────────────
function buildLaneTaskSuggestionsPrompt(laneName, lanes, externalActors) {
  const ctx = processFlowDescription
    ? `\nDescripción detallada del proceso:\n${processFlowDescription}\n`
    : '';
  return `Proceso BPMN.
Departamentos internos: ${lanes.join(', ')}.
Actores/canales externos: ${externalActors.length > 0 ? externalActors.join(', ') : 'ninguno'}.${ctx}
Departamento a analizar: "${laneName}"

Genera la secuencia COMPLETA de elementos BPMN para este departamento respetando EXACTAMENTE lo descrito.
Incluye gateways donde haya decisiones, eventos de mensaje donde se envíe o espere comunicación, y tareas normales.

Tipos de elementos válidos:
- "task": tarea o actividad genérica
- "sendTask": envío de mensaje/dato a un actor externo
- "intermediateCatchEvent": espera de mensaje entrante del exterior
- "intermediateThrowEvent": lanzamiento de mensaje al exterior (explícito)
- "exclusiveGateway": gateway de decisión XOR (bifurcación o unión)
- "parallelGateway": gateway paralelo, división o unión de flujos

REGLAS:
- Un gateway de bifurcación (split) debe ir seguido de otro del mismo tipo para la unión (join) si el flujo converge.
- Coloca los gateways y eventos de mensaje donde la descripción los mencione explícitamente.
- Entre 3 y 8 elementos en total.

Responde SOLO con JSON (sin texto adicional):
{"elementos": [{"tipo": "task", "nombre": "Validar pedido"}, {"tipo": "exclusiveGateway", "nombre": "¿Pago correcto?"}, {"tipo": "task", "nombre": "Confirmar pedido"}, {"tipo": "exclusiveGateway", "nombre": "Fin decisión"}, {"tipo": "sendTask", "nombre": "Enviar factura"}]}`;
}

// ─── LANE TASKS: HELPERS DE TIPO ─────────────────────────────────────────────
function elementIcon(tipo) {
  const icons = {
    task:                   '📋',
    sendTask:               '📤',
    intermediateCatchEvent: '📩',
    intermediateThrowEvent: '📨',
    exclusiveGateway:       '◇',
    parallelGateway:        '╋',
  };
  return icons[tipo] || '📋';
}
function elementLabel(tipo) {
  const labels = {
    task:                   'Tarea',
    sendTask:               'Envío',
    intermediateCatchEvent: 'Espera msg',
    intermediateThrowEvent: 'Lanza msg',
    exclusiveGateway:       'Gateway XOR',
    parallelGateway:        'Gateway AND',
  };
  return labels[tipo] || 'Tarea';
}

// ─── LANE TASKS: TARJETA ─────────────────────────────────────────────────────
function showLaneTaskCard(laneIdx, elementos) {
  const messages = document.getElementById('ai-messages');
  const old = document.getElementById('lane-task-card'); if (old) old.remove();

  const lane  = confirmedStructure.poolPrincipal.lanes[laneIdx];
  const total = confirmedStructure.poolPrincipal.lanes.length;

  _currentLaneTasks = elementos.map(e => ({
    nombre: e.nombre || e,
    tipo:   e.tipo   || 'task'
  }));

  const wrapper = document.createElement('div');
  wrapper.className = 'msg ai'; wrapper.id = 'lane-task-card';

  function rowsHtml() {
    if (_currentLaneTasks.length === 0)
      return '<p class="val-empty">Sin elementos. Añade uno abajo.</p>';
    return _currentLaneTasks.map((t, i) => `
      <div class="del-row">
        <span class="del-chip-icon" title="${elementLabel(t.tipo)}">${elementIcon(t.tipo)}</span>
        <span class="del-chip-name">${t.nombre}</span>
        <span class="del-chip-type" style="font-size:10px;color:#888;margin-left:4px">${elementLabel(t.tipo)}</span>
        <button class="del-row-remove" data-idx="${i}">×</button>
      </div>`).join('');
  }

  const TIPOS_HTML = ['task','sendTask','exclusiveGateway','parallelGateway','intermediateCatchEvent','intermediateThrowEvent']
    .map(t => `<option value="${t}">${elementIcon(t)} ${elementLabel(t)}</option>`).join('');

  wrapper.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble value-bubble">
      <div class="val-header">📋 ${lane}
        <span class="val-actor-sub">&nbsp;—&nbsp;dept. ${laneIdx+1}/${total}</span>
      </div>
      <div class="val-subtitle">Elementos BPMN para <b>${lane}</b>. Edita o añade.</div>
      <div id="lane-task-rows">${rowsHtml()}</div>
      <div class="val-add-row" style="margin-top:8px;gap:4px">
        <select id="lane-task-tipo" class="val-desc-input" style="flex:0 0 auto;width:130px">${TIPOS_HTML}</select>
        <input type="text" class="val-desc-input" id="lane-task-new" placeholder="Nombre del elemento…" style="flex:1">
        <button class="val-add-btn" id="lane-task-add">+</button>
      </div>
    </div>`;

  messages.appendChild(wrapper); messages.scrollTop = messages.scrollHeight;

  function rebuildRows() {
    wrapper.querySelector('#lane-task-rows').innerHTML = rowsHtml();
    wrapper.querySelectorAll('.del-row-remove').forEach(btn =>
      btn.addEventListener('click', () => {
        _currentLaneTasks.splice(parseInt(btn.dataset.idx), 1);
        rebuildRows();
      })
    );
  }
  wrapper.querySelectorAll('.del-row-remove').forEach(btn =>
    btn.addEventListener('click', () => {
      _currentLaneTasks.splice(parseInt(btn.dataset.idx), 1);
      rebuildRows();
    })
  );
  wrapper.querySelector('#lane-task-add').addEventListener('click', () => {
    const inp  = wrapper.querySelector('#lane-task-new');
    const sel  = wrapper.querySelector('#lane-task-tipo');
    const name = inp.value.trim(); if (!name) return;
    _currentLaneTasks.push({ nombre: name, tipo: sel.value }); inp.value = ''; rebuildRows();
  });
  wrapper.querySelector('#lane-task-new').addEventListener('keydown', e => {
    if (e.key === 'Enter') wrapper.querySelector('#lane-task-add').click();
  });
}

// ─── LANE TASKS: FLUJO ───────────────────────────────────────────────────────
async function startLaneTaskFlow(laneIdx) {
  const lane  = confirmedStructure.poolPrincipal.lanes[laneIdx];
  const lanes = confirmedStructure.poolPrincipal.lanes;
  const ext   = (confirmedStructure.poolExterno || []).map(p => p.nombre);

  currentLaneTaskIdx = laneIdx;
  fase = 'lane_tasks'; updateUI();

  addMessage(`📋 <b>${lane}</b> — buscando tareas sugeridas...`, 'ai');
  addTyping();
  let suggestions = [];
  try {
    const reply = await callAPI(DEFAULT_API_KEY, 'Eres experto en modelado BPMN. Responde SOLO con JSON.',
      [{ role: 'user', content: buildLaneTaskSuggestionsPrompt(lane, lanes, ext) }]);
    removeTyping();
    const m = reply.match(/\{[\s\S]*\}/);
    const data = JSON.parse(m ? m[0] : reply);
    // Soporta tanto el nuevo formato {elementos:[]} como el antiguo {tareas:[]}
    if (Array.isArray(data.elementos)) {
      suggestions = data.elementos;
    } else if (Array.isArray(data.tareas)) {
      suggestions = data.tareas.map(t => ({ tipo: 'task', nombre: t.nombre || t }));
    }
  } catch(e) { removeTyping(); suggestions = []; }

  showLaneTaskCard(laneIdx, suggestions);
}

async function handleConfirmLaneTasks(laneIdx) {
  const lane  = confirmedStructure.poolPrincipal.lanes[laneIdx];
  const total = confirmedStructure.poolPrincipal.lanes.length;
  const tasks = _currentLaneTasks.slice();

  const card = document.getElementById('lane-task-card');
  if (card) disableCard(card);

  if (tasks.length > 0) {
    addMessage(`✅ <b>${lane}</b>: ${tasks.map(t => `${elementIcon(t.tipo || 'task')} ${t.nombre}`).join(', ')}`, 'user');
    tasks.forEach((t, i) => {
      diagramState.laneTasks.push({ id: `LT_${laneIdx}_${i}`, name: t.nombre, laneIdx, tipo: t.tipo || 'task' });
    });
  } else {
    addMessage(`⏭ <b>${lane}</b>: sin tareas.`, 'user');
  }

  try {
    const xml = renderDiagramFromState(confirmedStructure, diagramState);
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
  } catch(err) {
    addMessage(`❌ Error al actualizar el diagrama: ${err.message}`, 'ai', 'err'); return;
  }

  const nextLane = laneIdx + 1;
  if (nextLane < total) {
    await startLaneTaskFlow(nextLane);
  } else {
    const ext = confirmedStructure.poolExterno || [];
    if (ext.length === 0) {
      addMessage('✅ ¡Todas las tareas definidas! El diagrama está listo para editar.', 'ai', 'ok');
      fase = 'refine'; updateUI();
    } else {
      addMessage(
        `✅ Tareas de todos los departamentos definidas.<br>Ahora identificaré qué entrega el proceso a cada canal externo.`,
        'ai'
      );
      currentActorIdx = 0;
      await startActorDeliveryFlow(DEFAULT_API_KEY, 0);
    }
  }
}

async function handleModifyLaneTasks(modification) {
  const laneIdx = currentLaneTaskIdx;
  const lane    = confirmedStructure.poolPrincipal.lanes[laneIdx];
  const lanes   = confirmedStructure.poolPrincipal.lanes;
  const ext     = (confirmedStructure.poolExterno || []).map(p => p.nombre);
  addTyping();
  try {
    const current = _currentLaneTasks.map(t => `${t.tipo}:"${t.nombre}"`).join(', ');
    const prompt = `Elementos actuales de "${lane}": ${current || 'ninguno'}.\nModificación solicitada: "${modification}".\n\nDevuelve la lista actualizada con tipos BPMN correctos SOLO en JSON:\n{"elementos": [{"tipo": "task|sendTask|exclusiveGateway|parallelGateway|intermediateCatchEvent|intermediateThrowEvent", "nombre": "..."}]}`;
    const reply = await callAPI(DEFAULT_API_KEY, 'Eres experto en modelado BPMN. Responde SOLO con JSON.',
      [{ role: 'user', content: prompt }]);
    removeTyping();
    const m = reply.match(/\{[\s\S]*\}/);
    const data = JSON.parse(m ? m[0] : reply);
    const newTasks = Array.isArray(data.elementos) ? data.elementos
      : Array.isArray(data.tareas) ? data.tareas.map(t => ({ tipo: 'task', nombre: t.nombre || t })) : [];
    showLaneTaskCard(laneIdx, newTasks);
    addMessage('Tareas actualizadas ✅ ¿Está bien así?', 'ai');
  } catch(e) { removeTyping(); addMessage(`❌ Error: ${e.message}`, 'ai', 'err'); }
}

// ─── PASO 3: CONFIRMAR ENTREGAS DE UN ACTOR → actualizar diagrama programáticamente
async function handleConfirmActorDeliveries(actorIdx, entregas) {
  const apiKey = DEFAULT_API_KEY;

  const actor = confirmedStructure.poolExterno[actorIdx];
  const total = confirmedStructure.poolExterno.length;

  if (entregas.length > 0) {
    const resumen = entregas.map(e => `📦 ${e.nombre} (${confirmedStructure.poolPrincipal.lanes[e.laneIdx]})`).join(', ');
    addMessage(`✅ <b>${actor.nombre}</b>: ${resumen}`, 'user');
    // Añadir sendTasks al estado del diagrama
    entregas.forEach((e, i) => {
      diagramState.sendTasks.push({
        id: `ST_${actorIdx}_${i}`,
        name: e.nombre,
        laneIdx: e.laneIdx,
        participantIdx: actorIdx
      });
    });
  } else {
    addMessage(`⏭ <b>${actor.nombre}</b>: sin entregas.`, 'user');
  }

  // Regenerar el diagrama programáticamente (sin LLM)
  try {
    const xml = renderDiagramFromState(confirmedStructure, diagramState);
    window._lastGeneratedXML = xml;
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
  } catch(err) {
    addMessage(`❌ Error al actualizar el diagrama: ${err.message}`, 'ai', 'err');
    return;
  }

  // ¿Hay más actores?
  const nextIdx = actorIdx + 1;
  if (nextIdx < total) {
    // Siguiente actor
    await startActorDeliveryFlow(apiKey, nextIdx);
  } else {
    // Todos los actores procesados → fase refine
    fase = 'refine'; updateUI();
    const totalEntregas = diagramState.sendTasks.length;
    addMessage(
      `✅ ¡Diagrama completado! <b>${totalEntregas}</b> entrega(s) modeladas para ${total} canal(es) externo(s).<br>
       Puedes pedir modificaciones o analizar el valor PERVAL.`, 'ai', 'ok'
    );
  }
}

// ─── PASO 4: REFINAMIENTO (LLM para modificaciones textuales) ───────────────
function buildRefinementSystemPrompt() {
  return `Eres un experto BPMN 2.0. Modifica el diagrama según la instrucción del usuario.
Devuelve SOLO XML válido completo (desde <?xml hasta </definitions>), sin texto ni markdown.
Mantén todos los pools, lanes, sendTasks y messageFlows existentes.
Añade o modifica solo lo que el usuario pida.`;
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
    addMessage('✅ ¡Diagrama modificado!', 'ai', 'ok');
  } catch(err) { removeTyping(); addMessage(`❌ Error: ${err.message}`, 'ai', 'err'); }
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
  } else if (fase === 'describe_process') {
    if (!input) return;
    addMessage(input, 'user'); document.getElementById('ai-scenario').value = '';
    sendBtn.disabled = true; await handleDescribeProcessFlow(input); sendBtn.disabled = false;
  } else if (fase === 'refine') {
    if (!input) return;
    addMessage(input, 'user'); document.getElementById('ai-scenario').value = '';
    sendBtn.disabled = true; await handleRefine(input); sendBtn.disabled = false;
  }
}

// ─── PERVAL: selección de actor → análisis ───────────────────────────────────
function showPervalActorSelect(actors, onSelect) {
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = 'msg ai';

  const btnHtml = actors.map(a =>
    `<button class="opt-btn perval-actor-btn" data-actor="${a}">👤 ${a}</button>`
  ).join('');

  div.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble question-bubble">
      <div class="question-text">¿Para qué canal externo quieres calcular el valor PERVAL?</div>
      <div class="options-grid">
        ${btnHtml}
        <button class="opt-btn" id="perval-todos">📊 Todos los actores</button>
      </div>
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
    addMessage('Todos los actores', 'user');
    onSelect(null);
  });
}

async function runPervalAnalysis(apiKey, actorName) {
  const pervalBtn = document.getElementById('ai-perval-btn');
  pervalBtn.disabled = true;
  addTyping();
  addMessage(`🔍 Calculando el valor PERVAL${actorName ? ` para <b>${actorName}</b>` : ''}...`, 'ai');

  try {
    const { xml: currentXML } = await modeler.saveXML({ format: true });
    const tasks = extractTasksFromXML(currentXML);
    if (tasks.length === 0) { removeTyping(); addMessage('⚠️ No hay tareas en el diagrama.', 'ai', 'err'); return; }

    const systemPrompt = buildPervalSystemPrompt(actorName);
    const rawResponse  = await callAPI(apiKey, systemPrompt,
      [{ role: 'user', content: buildPervalUserMessage(currentXML, tasks, actorName) }]);
    removeTyping();

    let data;
    try { const m = rawResponse.match(/\{[\s\S]*\}/); data = JSON.parse(m ? m[0] : rawResponse); }
    catch(e) { addMessage('❌ No se pudo procesar la respuesta PERVAL.', 'ai', 'err'); return; }

    showPervalResults(data, actorName);
    pervalAnalisado = true;
  } catch(err) { removeTyping(); addMessage(`❌ Error PERVAL: ${err.message}`, 'ai', 'err'); }
  finally { pervalBtn.disabled = false; updateUI(); }
}

async function analyzePerval() {
  const apiKey = DEFAULT_API_KEY;

  const externalActors = (confirmedStructure?.poolExterno || []).map(p => p.nombre);

  if (externalActors.length > 0) {
    showPervalActorSelect(externalActors, actorName => runPervalAnalysis(apiKey, actorName));
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

function buildPervalSystemPrompt(actorName) {
  const actorCtx = actorName
    ? `FOCO: analiza SOLO las tareas que tienen impacto directo o indirecto en la experiencia de "${actorName}". Ignora las tareas puramente internas sin relación con este actor.`
    : `Analiza todas las tareas del proceso.`;
  return `Eres un experto en análisis de valor percibido PERVAL (Sweeney y Soutar, 2001) aplicado a e-commerce.

${actorCtx}

DIMENSIONES PERVAL:
- Quality (Calidad): fiabilidad, seguridad, rendimiento, satisfacción del servicio
- Price (Precio): ahorro económico, transparencia de costes, relación calidad-precio
- Emotional (Emocional): conveniencia, facilidad, personalización, bienestar, tranquilidad
- Social (Social): reconocimiento, accesibilidad, flexibilidad de entrega/pago

Tareas internas sin impacto en el actor → clasifícalas como "Interno".

RESPONDE ÚNICAMENTE con JSON:
{
  "tareas": [{"nombre":"...","dimensiones":["Quality"],"valor":"...","justificacion":"..."}],
  "resumen": {"Quality":"...","Price":"...","Emotional":"...","Social":"..."},
  "valorGeneral": "..."
}`;
}

function buildPervalUserMessage(xml, tasks, actorName) {
  const actorLine = actorName ? `\nActor a analizar: ${actorName}` : '';
  return `TAREAS DEL PROCESO:${actorLine}\n${tasks.map((t,i)=>`${i+1}. ${t}`).join('\n')}\n\nXML BPMN:\n${xml}`;
}

function showPervalResults(data, actorName) {
  const dim = {
    Quality:   { bg:'rgba(59,130,246,0.15)',  border:'rgba(59,130,246,0.35)',  text:'#93c5fd', icon:'🔵', label:'Calidad'   },
    Price:     { bg:'rgba(34,197,94,0.15)',   border:'rgba(34,197,94,0.35)',   text:'#86efac', icon:'🟢', label:'Precio'    },
    Emotional: { bg:'rgba(249,115,22,0.15)',  border:'rgba(249,115,22,0.35)',  text:'#fdba74', icon:'🟠', label:'Emocional' },
    Social:    { bg:'rgba(168,85,247,0.15)',  border:'rgba(168,85,247,0.35)',  text:'#d8b4fe', icon:'🟣', label:'Social'    },
    Interno:   { bg:'rgba(107,114,128,0.12)', border:'rgba(107,114,128,0.25)',text:'#9ca3af', icon:'⚪', label:'Interno'   }
  };
  const taskRows = (data.tareas||[]).map(t => {
    const badges = (t.dimensiones||[]).map(d => { const c=dim[d]||dim.Interno; return`<span class="pv-badge" style="background:${c.bg};border:1px solid ${c.border};color:${c.text}">${c.icon} ${c.label}</span>`; }).join('');
    return`<div class="pv-row"><div class="pv-name">${t.nombre}</div><div class="pv-badges">${badges}</div><div class="pv-desc">${t.valor||''}</div></div>`;
  }).join('');
  const summaryCards = Object.entries(data.resumen||{}).map(([d,text]) => { const c=dim[d]||dim.Interno; return`<div class="pv-sum-card" style="background:${c.bg};border:1px solid ${c.border}"><div class="pv-sum-title" style="color:${c.text}">${c.icon} ${c.label}</div><div class="pv-sum-text">${text}</div></div>`; }).join('');
  const generalHtml = data.valorGeneral ? `<div class="pv-general"><span class="pv-general-lbl">Valoración global${actorName ? ` · ${actorName}` : ''} · </span>${data.valorGeneral}</div>` : '';
  const html = `<div class="pv-results"><div class="pv-header">📊 Análisis PERVAL${actorName ? ` — ${actorName}` : ''}</div><div class="pv-section-lbl">Clasificación por tarea</div><div class="pv-tasks">${taskRows}</div><div class="pv-section-lbl" style="margin-top:10px">Resumen por dimensión</div><div class="pv-summary">${summaryCards}</div>${generalHtml}</div>`;
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div'); div.className = 'msg ai';
  div.innerHTML = `<div class="msg-av">🤖</div><div class="msg-bubble pv-bubble">${html}</div>`;
  messages.appendChild(div); messages.scrollTop = messages.scrollHeight;
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
$(function() {
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

  document.getElementById('btn-confirm-main').addEventListener('click', () => {
    if (fase === 'confirm_structure') handleConfirmStructure();
    else if (fase === 'lane_tasks')   handleConfirmLaneTasks(currentLaneTaskIdx);
  });
  document.getElementById('btn-modify-main').addEventListener('click', () => {
    const ta  = document.getElementById('ai-scenario');
    const val = ta.value.trim();
    if (!val) { ta.focus(); return; }
    addMessage(val, 'user'); ta.value = '';
    if (fase === 'confirm_structure') handleModifyStructure(val);
    else if (fase === 'lane_tasks')   handleModifyLaneTasks(val);
  });
  document.getElementById('ai-perval-btn').addEventListener('click', analyzePerval);

  document.getElementById('ai-reset').addEventListener('click', () => {
    fase = 'describe'; processDescription = ''; processFlowDescription = ''; confirmedStructure = null;
    currentActorIdx = 0; currentLaneTaskIdx = 0; _currentLaneTasks = [];
    diagramState = { laneTasks: [], sendTasks: [] }; pervalAnalisado = false;
    document.getElementById('ai-messages').innerHTML = `
      <div class="msg ai"><div class="msg-av">🤖</div><div class="msg-bubble">
        ¡Hola! Describe el proceso de e-commerce que quieres modelar.<br><br>
        El flujo iterativo es:<br>
        <b>1·</b> Identifico los canales/usuarios del sistema (pools y lanes) → los dibujo<br>
        <b>2·</b> Defines qué entrega el proceso a cada canal externo<br>
        <b>3·</b> Genero el diagrama centrado en esas entregas de valor<br>
        <b>4·</b> Opcionalmente, calculas el valor PERVAL para el canal que elijas
      </div></div>`;
    updateUI();
    createNewDiagram();
  });

  updateUI();
});

function debounce(fn, timeout) { var timer; return function() { if (timer) clearTimeout(timer); timer = setTimeout(fn, timeout); }; }
