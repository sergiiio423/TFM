import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './style.css';

import $ from 'jquery';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import diagramXML from '../resources/newDiagram.bpmn';
import { t, getLang, setLang, recognitionLang } from './i18n.js';
import { callTool } from './mcpClient.js';

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
// Los gateways (exclusiveGateway/parallelGateway/inclusiveGateway) llevan además:
//   branches: [{ id, nombre, steps: [step...], endsHere: bool }]
//   join?: { id, tipo, nombre:'', laneIdx }   // solo si alguna rama converge
var diagramState        = { steps: [] };
var pervalAnalisado     = false;
// Modo del asistente paso a paso: false = pide confirmación de cada paso (tarjetas);
// true = genera todo el proceso de una vez, con el mismo razonamiento del LLM,
// auto-confirmando cada sugerencia hasta que el diagrama queda completo.
var autoGenerateAll     = false;
var _autoTypingEl       = null; // spinner persistente durante la generación automática

// Función para detener el dictado de voz y limpiar el estado de transcripción.
// Se asigna en setupVoiceInput(); hasta entonces es un no-op.
var voiceClear = () => {};

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
function addTyping() {
  const m = document.getElementById('ai-messages');
  if (autoGenerateAll) {
    // En modo auto: un único spinner persistente que se re-ancla al fondo en cada llamada.
    if (_autoTypingEl) _autoTypingEl.remove();
    _autoTypingEl = document.createElement('div');
    _autoTypingEl.className = 'msg ai';
    _autoTypingEl.innerHTML = `<div class="msg-av">🤖</div><div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
    m.appendChild(_autoTypingEl); m.scrollTop = m.scrollHeight;
    return;
  }
  const d = document.createElement('div'); d.className = 'msg ai'; d.id = 'ai-typing';
  d.innerHTML = `<div class="msg-av">🤖</div><div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  m.appendChild(d); m.scrollTop = m.scrollHeight;
}
function removeTyping() {
  if (autoGenerateAll) return; // el spinner persistente lo elimina stopAutoTyping()
  const el = document.getElementById('ai-typing'); if (el) el.remove();
}
function stopAutoTyping() { if (_autoTypingEl) { _autoTypingEl.remove(); _autoTypingEl = null; } }

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
    const stepNum = (diagramState.steps || []).filter(s => s.tipo !== 'startEvent' && s.tipo !== 'endEvent' && s.tipo !== 'errorEndEvent').length + 1;
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
  const isGwTipo  = t => t === 'exclusiveGateway' || t === 'parallelGateway' || t === 'inclusiveGateway';
  // Tipos que terminan el proceso por sí mismos (no necesitan checkbox "último paso")
  const isSelfFinalTipo = t => t === 'endMessageEvent' || t === 'errorEndEvent';
  const inBranch  = !!branchCtx;

  // Dentro de una rama no se permiten gateways anidados
  const tipos = inBranch
    ? ['task','userTask','serviceTask','sendTask','intermediateCatchEvent','intermediateThrowEvent','compensationEvent','timerEvent','endMessageEvent','errorEndEvent']
    : ['task','userTask','serviceTask','sendTask','exclusiveGateway','parallelGateway','inclusiveGateway','intermediateCatchEvent','intermediateThrowEvent','compensationEvent','timerEvent','endMessageEvent','errorEndEvent'];
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
      <div class="val-add-row" id="step-final-row" style="margin-top:10px;display:${(!inBranch && isGwTipo(suggestion.tipo)) || isSelfFinalTipo(suggestion.tipo) ? 'none' : 'flex'}">
        <label style="font-size:11px;color:#bae6fd;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="step-final"${esFinal ? ' checked' : ''}>
          ${finalLbl}
        </label>
      </div>
      ${inBranch ? `
      <div class="val-add-row" id="step-endproc-row" style="margin-top:4px;display:${esFinal && !isSelfFinalTipo(suggestion.tipo) ? 'flex' : 'none'}">
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
    if (isSelfFinalTipo(tipoSel.value)) {
      confirmBtn.textContent = inBranch ? t('btnConfirmCloseCaseMsg') : t('btnConfirmFinishMsg');
      return;
    }
    if (finalChk.checked) confirmBtn.textContent = inBranch ? t('btnConfirmCloseCase') : t('btnConfirmFinish');
    else confirmBtn.textContent = t('btnConfirmContinue');
  }
  refreshBtn();

  tipoSel.addEventListener('change', () => {
    actorRow.style.display = (ext.length > 0 && isMsgTipo(tipoSel.value)) ? 'flex' : 'none';
    // Para gateways la continuación la deciden sus ramas; tipos auto-finales
    // terminan el paso/rama por sí mismos: en ambos casos se oculta el checkbox.
    const hideFinal = (!inBranch && isGwTipo(tipoSel.value)) || isSelfFinalTipo(tipoSel.value);
    finalRow.style.display = hideFinal ? 'none' : 'flex';
    if (endProcRow) endProcRow.style.display = (!hideFinal && finalChk.checked) ? 'flex' : 'none';
    refreshBtn();
  });
  finalChk.addEventListener('change', () => {
    if (endProcRow) endProcRow.style.display = finalChk.checked ? 'flex' : 'none';
    refreshBtn();
  });

  confirmBtn.addEventListener('click', () => {
    const tipoVal     = tipoSel.value;
    const isSelfFinal = isSelfFinalTipo(tipoVal);
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
      const fin     = isSelfFinal ? true : finalChk.checked;
      const termina = isSelfFinal ? true : (fin && !!wrapper.querySelector('#step-end-process')?.checked);
      branchCtx.onConfirm(stepData, fin, termina);
    } else {
      handleConfirmStep(stepData, isGwTipo(tipoVal) ? false : (isSelfFinal ? true : finalChk.checked));
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

// ─── PASO 1: IDENTIFICAR ESTRUCTURA ──────────────────────────────────────────
async function handleDescribeProcess(description) {
  processDescription = description;
  addTyping();
  try {
    const { structure, xml } = await callTool('identify_structure', { description, lang: getLang() });
    removeTyping();

    confirmedStructure = structure;
    await modeler.importXML(xml);
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
  } catch(err) { removeTyping(); addMessage(err.message, 'ai', 'err'); }
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
  addTyping();
  try {
    const { structure, xml } = await callTool('modify_structure', {
      currentStructure: confirmedStructure, modification, lang: getLang()
    });
    removeTyping();

    confirmedStructure = structure;
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
    addMessage(t('structUpdated'), 'ai');
    showStructureCard(structure);
    fase = 'confirm_structure'; updateUI();
  } catch(err) { removeTyping(); addMessage(err.message, 'ai', 'err'); showStructureCard(confirmedStructure); }
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
    userTask:               '👤',
    serviceTask:            '⚙️',
    sendTask:               '📤',
    intermediateCatchEvent: '📩',
    intermediateThrowEvent: '📨',
    compensationEvent:      '⏪',
    timerEvent:             '⏱️',
    endMessageEvent:        '✉️',
    errorEndEvent:          '🔴',
    exclusiveGateway:       '◇',
    parallelGateway:        '╋',
    inclusiveGateway:       '◎',
    startEvent:             '🏁',
    endEvent:               '🔚',
  };
  return icons[tipo] || '📋';
}
function elementLabel(tipo) {
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

/**
 * Renderiza el diagrama actual (confirmedStructure + diagramState) vía el
 * servidor MCP y lo importa en el modeler. Devuelve true si tuvo éxito.
 */
async function renderAndImport() {
  try {
    const { xml } = await callTool('render_diagram', { structure: confirmedStructure, diagramState });
    window._lastGeneratedXML = xml;
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
    return true;
  } catch(err) {
    addMessage(t('errDiagramUpdate', { msg: err.message }), 'ai', 'err');
    return false;
  }
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

  const { inicios, errorMsg } = await callTool('suggest_flow_start', {
    description: processFlowDescription, lanes, externalActors: ext, lang: getLang()
  });
  removeTyping();
  if (errorMsg) addMessage(errorMsg, 'ai', 'err');

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

  if (!await renderAndImport()) return;

  addMessage(t('startConfirmedMsg'), 'ai');
  if (autoGenerateAll) addMessage(t('autoModeRunningMsg'), 'ai');
  await startNextStepFlow();
}

// ─── PASO 3B: SIGUIENTE PASO (asistente paso a paso) ─────────────────────────
/**
 * Pide al LLM el siguiente paso del proceso y muestra la tarjeta para confirmarlo.
 */
async function startNextStepFlow(consecutiveDups = 0) {
  const lanes = effectiveLanes();
  const ext   = (confirmedStructure.poolExterno || []).map(p => p.nombre);
  const mainSteps = diagramState.steps.filter(s => s.tipo !== 'startEvent' && s.tipo !== 'endEvent' && s.tipo !== 'errorEndEvent');
  const stepNum = mainSteps.length + 1;

  fase = 'flow_step'; updateUI();
  if (!autoGenerateAll) addMessage(t('thinkingNextStep', { n: stepNum }), 'ai');
  addTyping();

  let { suggestion, esFinal, dupPersistente, limitReached, errorMsg } = await callTool('suggest_next_step', {
    description: processFlowDescription, lanes, externalActors: ext, steps: diagramState.steps, lang: getLang()
  });
  removeTyping();

  const lastLaneIdx = mainSteps.length > 0 ? mainSteps[mainSteps.length - 1].laneIdx : 0;
  if (limitReached) {
    addMessage(t('limitReachedStep'), 'ai', 'err');
    await finishDiagramNow(lastLaneIdx);
    return;
  }
  if (errorMsg) {
    addMessage(errorMsg, 'ai', 'err');
    if (autoGenerateAll) {
      await finishDiagramNow(lastLaneIdx);
      return;
    }
  }

  if (dupPersistente) {
    if (autoGenerateAll) {
      // Omitir el paso repetido y consultar de nuevo al LLM para que proponga
      // un camino alternativo. Solo se cierra el diagrama si tras 8 reintentos
      // consecutivos sigue sin encontrar un paso nuevo (caso extremadamente raro).
      if (consecutiveDups < 8) {
        await startNextStepFlow(consecutiveDups + 1);
        return;
      }
      // Límite de seguridad anti-bucle: cerrar solo como último recurso.
      await finishDiagramNow(lastLaneIdx);
      return;
    }
    esFinal = true; // en modo manual la tarjeta propone cerrar; el usuario decide
  }

  if (autoGenerateAll) { await handleConfirmStep(suggestionToStepData(suggestion), esFinal); return; }

  showNextStepCard(suggestion, stepNum, esFinal);
}

/**
 * Cierra el flujo principal añadiendo solo el evento de Fin (sin paso nuevo).
 * Se usa cuando, en modo automático, la IA empieza a repetir pasos: así el
 * diagrama termina siempre sin elementos duplicados.
 */
async function finishDiagramNow(laneIdx) {
  diagramState.steps.push({ id: 'END_0', tipo: 'endEvent', nombre: t('elEnd'), laneIdx });
  if (!await renderAndImport()) return;
  stopAutoTyping();
  fase = 'refine'; updateUI();
  addMessage(t('diagramComplete'), 'ai', 'ok');
}

async function handleConfirmStep(stepData, isFinal) {
  const lanes = effectiveLanes();
  const n = diagramState.steps.filter(s => s.tipo !== 'startEvent' && s.tipo !== 'endEvent' && s.tipo !== 'errorEndEvent').length;
  const isGW       = stepData.tipo === 'exclusiveGateway' || stepData.tipo === 'parallelGateway' || stepData.tipo === 'inclusiveGateway';
  const isEndMsg   = stepData.tipo === 'endMessageEvent';
  const isErrorEnd = stepData.tipo === 'errorEndEvent';
  const isSelfEnd  = isEndMsg || isErrorEnd;

  // Tipos que son su propio evento de fin: no se añade un Fin aparte.
  const step = isEndMsg
    ? { id: 'END_0', tipo: 'endEvent', nombre: stepData.nombre, laneIdx: stepData.laneIdx, participantIdx: stepData.participantIdx, messageTrigger: true }
    : isErrorEnd
    ? { id: 'END_0', tipo: 'errorEndEvent', nombre: stepData.nombre, laneIdx: stepData.laneIdx }
    : { id: `S_${n}`, tipo: stepData.tipo, nombre: stepData.nombre, laneIdx: stepData.laneIdx, participantIdx: stepData.participantIdx };
  if (isGW) { step.branches = []; isFinal = false; }
  if (isSelfEnd) isFinal = true;
  diagramState.steps.push(step);

  if (!autoGenerateAll) {
    let label = `${elementIcon(stepData.tipo)} ${stepData.nombre} (${lanes[stepData.laneIdx]})`;
    if (stepData.participantIdx !== undefined) {
      const ext = confirmedStructure.poolExterno || [];
      label += ` → 📨 ${ext[stepData.participantIdx]?.nombre || ''}`;
    }
    addMessage(label, 'user');
  }

  if (isFinal && !isSelfEnd) {
    diagramState.steps.push({ id: 'END_0', tipo: 'endEvent', nombre: t('elEnd'), laneIdx: stepData.laneIdx });
  }

  if (!await renderAndImport()) return;

  if (isGW) { await startBranchDefinitionPhase(step); return; }

  if (isFinal) {
    stopAutoTyping();
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
  if (!autoGenerateAll) addMessage(t('identifyingCases', { name: gatewayStep.nombre }), 'ai');
  addTyping();

  const { casos, errorMsg } = await callTool('suggest_gateway_branches', {
    description: processFlowDescription,
    gatewayStep: { nombre: gatewayStep.nombre, tipo: gatewayStep.tipo },
    lanes, externalActors: ext, lang: getLang()
  });
  removeTyping();
  if (errorMsg) addMessage(errorMsg, 'ai', 'err');

  if (autoGenerateAll) { handleConfirmBranches(gatewayStep, casos); return; }

  showBranchesCard(gatewayStep, casos);
}

function handleConfirmBranches(gatewayStep, casos) {
  gatewayStep.branches = casos.map((nombre, i) => ({
    id: `${gatewayStep.id}_B${i}`, nombre, steps: [], endsHere: false
  }));
  if (!autoGenerateAll) addMessage(casos.map(c => `🔀 ${c}`).join('<br>'), 'user');
  startBranchStepFlow(gatewayStep, 0);
}

/**
 * Sub-asistente paso a paso dentro de una rama del gateway.
 */
async function startBranchStepFlow(gatewayStep, branchIdx, consecutiveDups = 0) {
  const lanes  = effectiveLanes();
  const ext    = (confirmedStructure.poolExterno || []).map(p => p.nombre);
  const branch = gatewayStep.branches[branchIdx];
  const stepNum = branch.steps.length + 1;

  fase = 'flow_branch_step'; updateUI();
  if (!autoGenerateAll) addMessage(t('caseStepThinking', { branch: branch.nombre, i: branchIdx + 1, total: gatewayStep.branches.length, n: stepNum }), 'ai');
  addTyping();

  let { suggestion, esFinalRama, terminaProceso, dupPersistente, limitReached, errorMsg } = await callTool('suggest_branch_step', {
    description: processFlowDescription, lanes, externalActors: ext,
    gatewayStep: { nombre: gatewayStep.nombre, tipo: gatewayStep.tipo, laneIdx: gatewayStep.laneIdx },
    branch: { nombre: branch.nombre, steps: branch.steps },
    lang: getLang()
  });
  removeTyping();

  if (limitReached) {
    addMessage(t('limitReachedBranch'), 'ai', 'err');
    if (branchIdx + 1 < gatewayStep.branches.length) await startBranchStepFlow(gatewayStep, branchIdx + 1);
    else await finishBranches(gatewayStep);
    return;
  }
  if (errorMsg) {
    addMessage(errorMsg, 'ai', 'err');
    if (autoGenerateAll) {
      if (branchIdx + 1 < gatewayStep.branches.length) await startBranchStepFlow(gatewayStep, branchIdx + 1);
      else await finishBranches(gatewayStep);
      return;
    }
  }

  if (dupPersistente) {
    if (autoGenerateAll) {
      // Omitir el paso repetido y consultar de nuevo al LLM para un paso alternativo.
      // Solo se cierra la rama tras 8 reintentos consecutivos sin éxito.
      if (consecutiveDups < 8) {
        await startBranchStepFlow(gatewayStep, branchIdx, consecutiveDups + 1);
        return;
      }
      if (branchIdx + 1 < gatewayStep.branches.length) await startBranchStepFlow(gatewayStep, branchIdx + 1);
      else await finishBranches(gatewayStep);
      return;
    }
    esFinalRama = true; // en modo manual la tarjeta propone cerrar el caso; el usuario decide
  }

  if (autoGenerateAll) {
    const allowedTipos = ['task','userTask','serviceTask','sendTask','intermediateCatchEvent','intermediateThrowEvent','compensationEvent','timerEvent','endMessageEvent','errorEndEvent'];
    const stepData = suggestionToStepData(suggestion, allowedTipos);
    const isEndMsg   = stepData.tipo === 'endMessageEvent';
    const isErrorEnd = stepData.tipo === 'errorEndEvent';
    const isSelfEnd  = isEndMsg || isErrorEnd;
    const fin     = isSelfEnd ? true : esFinalRama;
    const termina = isSelfEnd ? true : (fin && terminaProceso);
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
  const lanes      = effectiveLanes();
  const branch     = gatewayStep.branches[branchIdx];
  const isEndMsg   = stepData.tipo === 'endMessageEvent';
  const isErrorEnd = stepData.tipo === 'errorEndEvent';
  const isSelfEnd  = isEndMsg || isErrorEnd;

  if (isSelfEnd) {
    // Tipos auto-finales: el propio paso es el evento de fin de la rama.
    const endStep = isEndMsg
      ? { id: `${branch.id}_END`, tipo: 'endEvent', nombre: stepData.nombre, laneIdx: stepData.laneIdx, participantIdx: stepData.participantIdx, messageTrigger: true }
      : { id: `${branch.id}_END`, tipo: 'errorEndEvent', nombre: stepData.nombre, laneIdx: stepData.laneIdx };
    branch.steps.push(endStep);
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

  if (!autoGenerateAll) {
    let label = `${elementIcon(stepData.tipo)} [${branch.nombre}] ${stepData.nombre} (${lanes[stepData.laneIdx]})`;
    if (stepData.participantIdx !== undefined) {
      const ext = confirmedStructure.poolExterno || [];
      label += ` → 📨 ${ext[stepData.participantIdx]?.nombre || ''}`;
    }
    addMessage(label, 'user');
  }

  if (!await renderAndImport()) return;

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

  if (!await renderAndImport()) return;

  if (converge) {
    if (!autoGenerateAll) addMessage(t('casesCompletedConverge', { name: gatewayStep.nombre }), 'ai');
    await startNextStepFlow();
  } else {
    stopAutoTyping();
    fase = 'refine'; updateUI();
    addMessage(t('diagramCompleteAllBranches'), 'ai', 'ok');
  }
}

// ─── PASO 4: REFINAMIENTO (LLM para modificaciones textuales) ───────────────
async function handleRefine(instruction) {
  const sendBtn = document.getElementById('ai-send'); sendBtn.disabled = true;
  addTyping();
  try {
    const { xml } = await callTool('refine_diagram', {
      structure: confirmedStructure, diagramState, instruction, lang: getLang()
    });
    removeTyping();
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
    addMessage(t('diagramModified'), 'ai', 'ok');
  } catch(err) { removeTyping(); addMessage(err.message, 'ai', 'err'); }
  finally { sendBtn.disabled = false; updateUI(); }
}

// ─── DISPATCHER ──────────────────────────────────────────────────────────────
async function handleSend() {
  const input   = document.getElementById('ai-scenario').value.trim();
  const sendBtn = document.getElementById('ai-send');

  if (fase === 'describe') {
    if (!input) return;
    voiceClear(); addMessage(input, 'user'); document.getElementById('ai-scenario').value = '';
    sendBtn.disabled = true; await handleDescribeProcess(input); sendBtn.disabled = false;
  } else if (fase === 'confirm_structure') {
    if (!input) return;
    voiceClear(); addMessage(input, 'user'); document.getElementById('ai-scenario').value = '';
    sendBtn.disabled = true; await handleModifyStructure(input); sendBtn.disabled = false;
  } else if (fase === 'refine') {
    if (!input) return;
    voiceClear(); addMessage(input, 'user'); document.getElementById('ai-scenario').value = '';
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
  voiceClear();
  addMessage(val, 'user');
  processFlowDescription = (processFlowDescription ? processFlowDescription + '\n' : '') + val;
  ta.value = '';
  addMessage(t('addInfoConfirmedMsg'), 'ai', 'ok');
}

// ─── PERVAL: selección de actor → análisis ───────────────────────────────────
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

async function runPervalAnalysis(actorName) {
  const pervalBtn = document.getElementById('ai-perval-btn');
  pervalBtn.disabled = true;
  addTyping();
  addMessage(t('calculatingPerval', { forActor: actorName ? t('forActorSuffix', { actor: actorName }) : '' }), 'ai');

  try {
    const { xml: currentXML } = await modeler.saveXML({ format: true });

    let scope = 'entregas';
    let tasks = extractClientDeliverablesFromXML(currentXML, confirmedStructure);
    if (tasks.length === 0) {
      scope = 'tareas';
      tasks = extractTasksFromXML(currentXML);
    }
    if (tasks.length === 0) { removeTyping(); addMessage(t('noElementsToAnalyze'), 'ai', 'err'); return; }

    const { data } = await callTool('analyze_perval', { xml: currentXML, tasks, actorName, scope, lang: getLang() });
    removeTyping();

    showPervalResults(data, actorName);
    pervalAnalisado = true;
  } catch(err) { removeTyping(); addMessage(err.message, 'ai', 'err'); }
  finally { pervalBtn.disabled = false; updateUI(); }
}

async function analyzePerval() {
  const ext = confirmedStructure?.poolExterno || [];
  const clientActors       = ext.filter(p => p.rol === 'cliente').map(p => p.nombre);
  const collaboratorActors = ext.filter(p => p.rol !== 'cliente').map(p => p.nombre);

  if (ext.length > 0) {
    showPervalActorSelect(clientActors, collaboratorActors, actorName => runPervalAnalysis(actorName));
  } else {
    runPervalAnalysis(null);
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

const PERVAL_DIM = {
  Quality:   { icon:'🔵', label:'Calidad',   text:'#93c5fd', diagram:{ fill:'#dbeafe', stroke:'#3b82f6' } },
  Price:     { icon:'🟢', label:'Precio',    text:'#86efac', diagram:{ fill:'#dcfce7', stroke:'#22c55e' } },
  Emotional: { icon:'🟠', label:'Emocional', text:'#fdba74', diagram:{ fill:'#ffedd5', stroke:'#f97316' } },
  Social:    { icon:'🟣', label:'Social',    text:'#d8b4fe', diagram:{ fill:'#f3e8ff', stroke:'#a855f7' } },
  Interno:   { icon:'⚪', label:'Interno',   text:'#9ca3af', diagram:{ fill:'#f3f4f6', stroke:'#9ca3af' } }
};
const PERVAL_NIVEL = {
  muy_bueno: { label:'Muy bueno', fill:'#dcfce7', stroke:'#22c55e', text:'#86efac', icon:'🟢' },
  bueno:     { label:'Bueno',     fill:'#dbeafe', stroke:'#3b82f6', text:'#93c5fd', icon:'🔵' },
  regular:   { label:'Regular',   fill:'#fef9c3', stroke:'#eab308', text:'#fde047', icon:'🟡' },
  malo:      { label:'Malo',      fill:'#ffedd5', stroke:'#f97316', text:'#fdba74', icon:'🟠' },
  muy_malo:  { label:'Muy malo',  fill:'#fee2e2', stroke:'#ef4444', text:'#fca5a5', icon:'🔴' }
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
    const niv = PERVAL_NIVEL[t.nivel] || PERVAL_NIVEL.regular;
    const nivelBadge = `<span class="pv-badge" style="background:${pervalRgba(niv.stroke,0.15)};border:1px solid ${pervalRgba(niv.stroke,0.35)};color:${niv.text}">${niv.icon} ${niv.label}</span>`;
    const valorHtml = t.valor ? `<div class="pv-desc"><b>Valor:</b> ${t.valor}</div>` : '';
    const justHtml  = t.justificacion ? `<div class="pv-desc"><b>Justificación:</b> ${t.justificacion}</div>` : '';
    return`<div class="pv-row"><div class="pv-name">${t.nombre} ${nivelBadge}</div><div class="pv-badges">${badges}</div>${valorHtml}${justHtml}</div>`;
  }).join('');
  const summaryCards = Object.entries(data.resumen||{}).map(([d,text]) => { const c=dim[d]||dim.Interno; return`<div class="pv-sum-card" style="background:${c.bg};border:1px solid ${c.border}"><div class="pv-sum-title" style="color:${c.text}">${c.icon} ${c.label}</div><div class="pv-sum-text">${text}</div></div>`; }).join('');
  const generalHtml = data.valorGeneral ? `<div class="pv-general"><span class="pv-general-lbl">${t('pervalGlobalLbl')}${actorName ? ` · ${actorName}` : ''} · </span>${data.valorGeneral}</div>` : '';

  const legendChips = Object.values(PERVAL_NIVEL).map(n =>
    `<span class="pv-legend-chip" style="background:${n.fill};border:1px solid ${n.stroke};color:#1f2937">${n.icon} ${n.label}</span>`
  ).join('');
  const legendHtml = `<div class="pv-actions"><div class="pv-legend">${legendChips}</div></div>`;

  const html = `<div class="pv-results"><div class="pv-header">${t('pervalHeader')}${actorName ? ` — ${actorName}` : ''}</div><div class="pv-section-lbl">${t('pervalClassifByTask')}</div><div class="pv-tasks">${taskRows}</div><div class="pv-section-lbl" style="margin-top:10px">${t('pervalSummaryByDim')}</div><div class="pv-summary">${summaryCards}</div>${generalHtml}${legendHtml}</div>`;
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div'); div.className = 'msg ai';
  div.innerHTML = `<div class="msg-av">🤖</div><div class="msg-bubble pv-bubble">${html}</div>`;
  messages.appendChild(div); messages.scrollTop = messages.scrollHeight;

  if ((data.tareas||[]).length > 0) {
    applyPervalColors(data.tareas);
  }
}

// ─── PERVAL: colorear diagrama por NIVEL de rendimiento (método Tatiane) ─────
function findElementsByName(nombre) {
  const elementRegistry = modeler.get('elementRegistry');
  const target = (nombre || '').trim();
  return elementRegistry.filter(el =>
    el.businessObject && !el.labelTarget && (el.businessObject.name || '').trim() === target
  );
}

let _pervalAnnotationIds = [];

function applyPervalColors(tareas) {
  const modeling = modeler.get('modeling');
  clearPervalAnnotations();
  (tareas || []).forEach(tarea => {
    const niv = PERVAL_NIVEL[tarea.nivel] || PERVAL_NIVEL.regular;
    const els = findElementsByName(tarea.nombre);
    if (!els.length) return;
    modeling.setColor(els, { fill: niv.fill, stroke: niv.stroke });
    const dims = (tarea.dimensiones || []).map(d => { const c = PERVAL_DIM[d] || PERVAL_DIM.Interno; return c.icon + ' ' + t(PERVAL_DIM_LABEL_KEYS[d] || 'dimInterno'); }).join(', ');
    const nivelLabel = niv.icon + ' ' + niv.label;
    const text = nivelLabel + '\n' + dims + (tarea.valor ? '\n' + tarea.valor : '');
    const annotation = createPervalAnnotation(els[0], text, niv);
    if (annotation) _pervalAnnotationIds.push(annotation.id);
  });
}

function clearPervalColors(tareas) {
  const modeling = modeler.get('modeling');
  (tareas || []).forEach(tarea => {
    const els = findElementsByName(tarea.nombre);
    if (els.length) modeling.setColor(els, { fill: null, stroke: null });
  });
  clearPervalAnnotations();
}

function createPervalAnnotation(el, text, color) {
  const modeling    = modeler.get('modeling');
  const bpmnFactory = modeler.get('bpmnFactory');

  const len    = (text || '').length;
  const width  = Math.min(220, Math.max(120, Math.ceil(len / 3) * 6));
  const lines  = Math.max(1, Math.ceil(len / 40));
  const height = Math.max(40, lines * 18 + 14);

  const businessObject = bpmnFactory.create('bpmn:TextAnnotation', { text });
  const position = { x: el.x + el.width / 2, y: el.y - height / 2 - 40 };

  let annotation;
  try {
    annotation = modeling.createShape(
      { type: 'bpmn:TextAnnotation', businessObject, width, height },
      position, el.parent
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
    if (!listening) return; // ignorar resultados tardíos tras stop()
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

  voiceClear = () => {
    if (listening) { try { recognition.stop(); } catch(_) {} listening = false; micBtn.classList.remove('recording'); }
    baseText = '';
    finalTranscript = '';
  };
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
    voiceClear(); addMessage(val, 'user'); ta.value = '';
    if (fase === 'confirm_structure') handleModifyStructure(val);
  });
  document.getElementById('ai-perval-btn').addEventListener('click', analyzePerval);

  document.getElementById('ai-reset').addEventListener('click', () => {
    fase = 'describe'; processDescription = ''; processFlowDescription = ''; confirmedStructure = null;
    diagramState = { steps: [] }; pervalAnalisado = false; autoGenerateAll = false; stopAutoTyping();
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

  const providerNotice = document.getElementById('ai-provider-notice');
  if (providerNotice) providerNotice.textContent = t('providerNotice');

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
