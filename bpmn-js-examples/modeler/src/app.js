import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';

import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

import './style.css';

import $ from 'jquery';

import BpmnModeler from 'bpmn-js/lib/Modeler';

import diagramXML from '../resources/newDiagram.bpmn';


var container = $('#js-drop-zone');

var modeler = new BpmnModeler({
  container: '#js-canvas',
});

function createNewDiagram() {
  openDiagram(diagramXML);
}

async function openDiagram(xml) {
  try {
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
  } catch (err) {
    container.removeClass('with-diagram').addClass('with-error');
    container.find('.error pre').text(err.message);
    console.error(err);
  }
}

function registerFileDrop(container, callback) {
  function handleFileSelect(e) {
    e.stopPropagation();
    e.preventDefault();
    var files = e.dataTransfer.files;
    var file = files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      var xml = e.target.result;
      callback(xml);
    };
    reader.readAsText(file);
  }

  function handleDragOver(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  container.get(0).addEventListener('dragover', handleDragOver, false);
  container.get(0).addEventListener('drop', handleFileSelect, false);
}

if (!window.FileList || !window.FileReader) {
  window.alert('Looks like you use an older browser that does not support drag and drop. Try using Chrome, Firefox or the Internet Explorer > 10.');
} else {
  registerFileDrop(container, openDiagram);
}

// ─── ESTADO ──────────────────────────────────────────────────────────────────

var fase = 'interview'; // 'interview' | 'diagram'
var interviewHistory = [];
var preguntaCount = 0;
var MAX_PREGUNTAS = 10;
var diagramaGenerado = false;
var pervalAnalisado = false;


// ─── HELPERS DEL CHAT ────────────────────────────────────────────────────────

function addMessage(text, type = 'ai', style = '') {
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  const avatar = type === 'ai' ? '🤖' : '👤';
  div.innerHTML = `
    <div class="msg-av">${avatar}</div>
    <div class="msg-bubble ${style}">${text}</div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function addTyping() {
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'ai-typing';
  div.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble">
      <div class="typing"><span></span><span></span><span></span></div>
    </div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById('ai-typing');
  if (t) t.remove();
}

// Renderiza una pregunta con opciones clicables
function addQuestionWithOptions(questionText, options, multiselect = false) {
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = 'msg ai';

  const optionsHTML = options.map((opt, i) => `
    <button class="opt-btn" data-index="${i}" data-value="${opt}">
      ${multiselect ? '☐' : '○'} ${opt}
    </button>
  `).join('');

  div.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="msg-bubble question-bubble">
      <div class="question-text">${questionText}</div>
      <div class="options-grid" id="options-${Date.now()}">
        ${optionsHTML}
      </div>
      ${multiselect ? '<div class="multiselect-hint">Puedes seleccionar varias opciones</div>' : ''}
      <div class="custom-option-row">
        <input type="text" class="custom-opt-input" placeholder="O escribe tu propia respuesta..." />
        <button class="confirm-opts-btn">Confirmar</button>
      </div>
    </div>
  `;

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  // Lógica de selección
  const selectedValues = new Set();
  const optBtns = div.querySelectorAll('.opt-btn');

  optBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (multiselect) {
        if (btn.classList.contains('selected')) {
          btn.classList.remove('selected');
          selectedValues.delete(btn.dataset.value);
          btn.innerHTML = `☐ ${btn.dataset.value}`;
        } else {
          btn.classList.add('selected');
          selectedValues.add(btn.dataset.value);
          btn.innerHTML = `☑ ${btn.dataset.value}`;
        }
      } else {
        optBtns.forEach(b => {
          b.classList.remove('selected');
          b.innerHTML = `○ ${b.dataset.value}`;
        });
        btn.classList.add('selected');
        btn.innerHTML = `● ${btn.dataset.value}`;
        selectedValues.clear();
        selectedValues.add(btn.dataset.value);
      }
    });
  });

  // Confirmar selección
  div.querySelector('.confirm-opts-btn').addEventListener('click', () => {
    const customVal = div.querySelector('.custom-opt-input').value.trim();
    let finalAnswer = '';

    if (customVal) {
      finalAnswer = customVal;
    } else if (selectedValues.size > 0) {
      finalAnswer = Array.from(selectedValues).join(', ');
    } else {
      return;
    }

    // Deshabilitar la pregunta
    div.querySelectorAll('.opt-btn, .confirm-opts-btn, .custom-opt-input').forEach(el => {
      el.disabled = true;
      el.style.opacity = '0.5';
      el.style.cursor = 'default';
    });

    // Mostrar respuesta del usuario y continuar
    addMessage(finalAnswer, 'user');
    processInterviewAnswer(finalAnswer);
  });
}

function updateUI() {
  const btn       = document.getElementById('ai-send');
  const textarea  = document.getElementById('ai-scenario');
  const inputArea = document.getElementById('ai-free-input');
  const pervalBtn = document.getElementById('ai-perval-btn');

  if (fase === 'interview') {
    btn.textContent = '➤ Enviar respuesta libre';
    btn.style.background = 'linear-gradient(135deg, #6366f1, #a855f7)';
    textarea.placeholder = 'O escribe libremente si ninguna opción encaja...';
    if (inputArea) inputArea.style.display = 'flex';
    if (pervalBtn) pervalBtn.style.display = 'none';
  } else if (fase === 'diagram' && !diagramaGenerado) {
    btn.textContent = '✦ Generar diagrama BPMN';
    btn.style.background = 'linear-gradient(135deg, #6366f1, #a855f7)';
    textarea.placeholder = 'Pulsa generar o añade algo más antes...';
    if (inputArea) inputArea.style.display = 'flex';
    if (pervalBtn) pervalBtn.style.display = 'none';
  } else {
    btn.textContent = '✦ Modificar diagrama';
    btn.style.background = 'linear-gradient(135deg, #059669, #0d9488)';
    textarea.placeholder = 'Ej: Añade un gateway antes del pago, renombra el lane de logística...';
    if (inputArea) inputArea.style.display = 'flex';
    if (pervalBtn) {
      pervalBtn.style.display = 'block';
      pervalBtn.textContent = pervalAnalisado ? '🔄 Re-analizar PERVAL' : '🔍 Analizar valor PERVAL';
    }
  }
}


// ─── PROMPTS ─────────────────────────────────────────────────────────────────

function buildInterviewSystemPrompt() {
  return `Eres un experto en modelado de procesos de negocio BPMN 2.0, especializado en comercio electrónico (e-commerce).

Tu objetivo es recopilar información para crear un diagrama BPMN completo con pools y lanes correctos.

INSTRUCCIONES:
- Haz como máximo 10 preguntas en total. Llevas {{COUNT}} preguntas hechas.
- Haz UNA sola pregunta a la vez.
- SIEMPRE que sea posible, ofrece opciones predefinidas en formato JSON al final de tu pregunta.
- El formato de tu respuesta debe ser SIEMPRE uno de estos dos:

FORMATO A - Pregunta con opciones:
PREGUNTA: [texto de la pregunta]
OPCIONES: ["opción1", "opción2", "opción3", "opción4"]
MULTISELECT: true/false

FORMATO B - Pregunta abierta (solo si no tiene sentido dar opciones):
PREGUNTA: [texto de la pregunta]

FORMATO C - Cuando tengas suficiente información (actores externos, departamentos, flujo principal, decisiones):
[READY_TO_GENERATE]

TEMAS A CUBRIR en orden:
1. Tipo de proceso de negocio (si no está claro del contexto inicial)
2. Actores EXTERNOS: clientes, proveedores, pasarelas de pago, transportistas
3. Valor que recibe el cliente externo al final
4. Departamentos/áreas INTERNAS (cada uno será un lane)
5. Sub-departamentos si los hay
6. Decisiones o condiciones clave que bifurcan el proceso
7. Notificaciones o comunicaciones con actores externos
8. Sistemas tecnológicos implicados
9. Restricciones temporales o de negocio relevantes
10. Cualquier caso especial o excepción importante

Si ya tienes información clara sobre actores, departamentos, flujo principal y decisiones clave, emite [READY_TO_GENERATE] aunque no hayas hecho las 10 preguntas.`;
}

function buildGenerationSystemPrompt() {
  return `Eres un experto en modelado de procesos BPMN 2.0 especializado en e-commerce.

Genera diagramas BPMN complejos y detallados, similares en riqueza visual a los diagramas profesionales con múltiples pools, lanes, gateways y message flows.

REGLAS ESTRICTAS - devuelve ÚNICAMENTE XML válido:
1. Empieza con <?xml version="1.0" encoding="UTF-8"?>
2. El elemento raíz <definitions> con estos namespaces obligatorios:
   xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
   xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
   xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
   xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
   targetNamespace="http://bpmn.io/schema/bpmn"
   id="Definitions_1"

3. ESTRUCTURA OBLIGATORIA:
   a) Un <collaboration id="Collaboration_1"> con:
      - Un <participant> por cada actor externo (Cliente, Pasarela de Pago, Mensajería, etc.)
      - Un <participant> para el proceso principal (Servicio de Catering)
      - <messageFlow> entre participants para mostrar comunicaciones entre ellos
   b) Un <process> por cada participant con sus elementos internos
   c) El proceso principal debe tener <laneSet> con un <lane> por cada departamento
   d) Cada flowElement referenciado en un lane mediante <flowNodeRef>

4. TIPOS DE ELEMENTOS a usar según contexto:
   - startEvent con messageEventDefinition para inicio por mensaje externo
   - endEvent con messageEventDefinition para envío de mensaje al finalizar
   - userTask para tareas manuales del usuario
   - serviceTask para tareas automáticas del sistema
   - sendTask para envío de notificaciones o emails
   - receiveTask para espera de confirmaciones externas
   - exclusiveGateway para decisiones SI/NO
   - parallelGateway para tareas en paralelo
   - intermediateCatchEvent con timerEventDefinition para esperas de tiempo
   - boundaryEvent para eventos que interrumpen una tarea

5. COORDENADAS Y TAMAÑO:
   - Pool principal (empresa): x=30, y=30, width=1400, height=500 (ajustar según lanes)
   - Cada lane interno: height=160, width igual al pool
   - Actors externos (pools): encima o debajo del pool principal, height=160
   - Primer lane en y=80 relativo al pool, siguiente en y=240, siguiente en y=400, etc.
   - Elementos: x empieza en 180 dentro del lane, incrementa 160 por elemento
   - y de cada elemento centrado en su lane
   - Tasks: width=100 height=80
   - Eventos: width=36 height=36
   - Gateways: width=50 height=50
   - messageFlow representado con BPMNEdge entre los elementos que se comunican

6. RIQUEZA DEL DIAGRAMA:
   - Incluye TODOS los pasos del proceso descritos en la entrevista
   - No simplifiques: si hay 15 tareas, dibuja 15 tareas
   - Incluye todos los gateways necesarios para las decisiones
   - Incluye messageFlow para TODAS las comunicaciones entre pools
   - Incluye eventos de timer cuando haya restricciones de tiempo

7. Tu respuesta empieza por <?xml y termina por </definitions>. Nada más.`;
}

function buildGenerationUserMessage(history) {
  const resumen = history
    .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
    .join('\n');

  return `Basándote en la siguiente entrevista, genera un diagrama BPMN 2.0 COMPLETO y DETALLADO en XML:

--- ENTREVISTA ---
${resumen}
--- FIN ENTREVISTA ---

IMPORTANTE:
- Crea un pool separado por cada actor externo identificado
- Crea un lane por cada departamento interno identificado
- Incluye messageFlow entre pools para todas las comunicaciones
- No omitas ningún paso, decisión o notificación mencionada
- El diagrama debe ser rico visualmente con todos los elementos necesarios`;
}

function buildRefinementMessage(instruction, currentXML) {
  return `Este es el diagrama BPMN actual en XML:

${currentXML}

Aplica la siguiente modificación y devuelve el XML completo actualizado:

"${instruction}"`;
}


// ─── PERVAL ───────────────────────────────────────────────────────────────────

function extractTasksFromXML(xml) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const ns = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
    const types = ['task', 'userTask', 'serviceTask', 'sendTask', 'receiveTask', 'manualTask', 'scriptTask', 'businessRuleTask'];
    const tasks = [];
    types.forEach(type => {
      Array.from(doc.getElementsByTagNameNS(ns, type)).forEach(el => {
        const name = el.getAttribute('name');
        if (name && name.trim()) tasks.push(name.trim());
      });
    });
    return [...new Set(tasks)];
  } catch (e) {
    console.error('Error extrayendo tareas:', e);
    return [];
  }
}

function buildPervalSystemPrompt() {
  return `Eres un experto en análisis del valor percibido por el cliente según la clasificación PERVAL (Sweeney y Soutar, 2001), aplicada a procesos de comercio electrónico.

La escala PERVAL evalúa el valor percibido a través de 4 dimensiones:

CALIDAD (Quality): Utilidad derivada de la calidad percibida y el desempeño del proceso.
Atributos: rendimiento consistente del sistema, proceso de selección intuitivo, seguridad y privacidad de datos, satisfacción del cliente, proactividad en resolución de problemas, flexibilidad y adaptabilidad del servicio.

PRECIO (Price): Utilidad derivada de la reducción de costos percibidos a corto y largo plazo.
Atributos: transparencia en el desglose de precios y tarifas, relación calidad-precio, posibilidad de ahorros financieros (descuentos, cupones, ofertas, precios competitivos).

EMOCIONAL (Emotional): Utilidad derivada de los sentimientos o estados afectivos generados al interactuar con el proceso.
Atributos: conveniencia y facilidad de uso, compensación por inconvenientes sufridos, personalización del servicio al cliente, atención a las necesidades específicas, bienestar y disfrute de la experiencia de compra.

SOCIAL (Social): Utilidad derivada de la mejora de la autopercepción social del cliente.
Atributos: cobertura extensa de entrega, flexibilidad en los métodos de entrega, flexibilidad en los métodos de pago, accesibilidad del servicio para distintos perfiles de usuario.

TAREA: Analiza el modelo BPMN de e-commerce proporcionado. Para cada tarea, identifica qué dimensión(es) PERVAL genera valor al cliente cuando este interactúa con dicha actividad. Las tareas puramente internas sin impacto en el cliente clasifícalas como "Interno".

REGLAS:
- Una tarea puede pertenecer a una o varias dimensiones
- Sé específico en la justificación, citando qué atributo PERVAL concreto aplica
- Considera tanto el impacto directo (el cliente ejecuta la tarea) como el indirecto (la tarea genera un resultado que el cliente percibe)

RESPONDE ÚNICAMENTE con JSON válido con esta estructura exacta:
{
  "tareas": [
    {
      "nombre": "nombre exacto de la tarea",
      "dimensiones": ["Quality"],
      "valor": "descripción breve del valor que aporta al cliente",
      "justificacion": "atributo PERVAL específico que aplica"
    }
  ],
  "resumen": {
    "Quality": "síntesis del valor de calidad generado en el proceso",
    "Price": "síntesis del valor económico generado",
    "Emotional": "síntesis del valor emocional generado",
    "Social": "síntesis del valor social generado"
  },
  "valorGeneral": "evaluación global del alineamiento entre el valor modelado por la organización y el valor potencialmente percibido por el cliente"
}`;
}

function buildPervalUserMessage(xml, tasks) {
  return `Analiza el siguiente modelo BPMN de proceso de compra en línea y clasifica cada tarea según las dimensiones PERVAL.

TAREAS IDENTIFICADAS EN EL PROCESO:
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

XML DEL MODELO BPMN:
${xml}

Devuelve el análisis PERVAL completo en formato JSON.`;
}

function showPervalResults(data) {
  const dim = {
    Quality:   { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.35)',  text: '#93c5fd', icon: '🔵', label: 'Calidad'   },
    Price:     { bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.35)',   text: '#86efac', icon: '🟢', label: 'Precio'    },
    Emotional: { bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.35)',  text: '#fdba74', icon: '🟠', label: 'Emocional' },
    Social:    { bg: 'rgba(168,85,247,0.15)',  border: 'rgba(168,85,247,0.35)',  text: '#d8b4fe', icon: '🟣', label: 'Social'    },
    Interno:   { bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.25)', text: '#9ca3af', icon: '⚪', label: 'Interno'   }
  };

  const taskRows = (data.tareas || []).map(t => {
    const badges = (t.dimensiones || []).map(d => {
      const c = dim[d] || dim.Interno;
      return `<span class="pv-badge" style="background:${c.bg};border:1px solid ${c.border};color:${c.text}">${c.icon} ${c.label}</span>`;
    }).join('');
    return `<div class="pv-row">
      <div class="pv-name">${t.nombre}</div>
      <div class="pv-badges">${badges}</div>
      <div class="pv-desc">${t.valor || ''}</div>
    </div>`;
  }).join('');

  const summaryCards = Object.entries(data.resumen || {}).map(([d, text]) => {
    const c = dim[d] || dim.Interno;
    return `<div class="pv-sum-card" style="background:${c.bg};border:1px solid ${c.border}">
      <div class="pv-sum-title" style="color:${c.text}">${c.icon} ${c.label}</div>
      <div class="pv-sum-text">${text}</div>
    </div>`;
  }).join('');

  const generalHtml = data.valorGeneral
    ? `<div class="pv-general"><span class="pv-general-lbl">Valoración global · </span>${data.valorGeneral}</div>`
    : '';

  const html = `<div class="pv-results">
    <div class="pv-header">📊 Análisis PERVAL del Proceso</div>
    <div class="pv-section-lbl">Clasificación por tarea</div>
    <div class="pv-tasks">${taskRows}</div>
    <div class="pv-section-lbl" style="margin-top:10px">Resumen por dimensión</div>
    <div class="pv-summary">${summaryCards}</div>
    ${generalHtml}
  </div>`;

  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.innerHTML = `<div class="msg-av">🤖</div><div class="msg-bubble pv-bubble">${html}</div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

async function analyzePerval() {
  const apiKey = document.getElementById('ai-apikey').value.trim();
  if (!apiKey) {
    addMessage('⚠️ Introduce tu API Key antes de continuar.', 'ai', 'err');
    return;
  }

  const pervalBtn = document.getElementById('ai-perval-btn');
  pervalBtn.disabled = true;
  addTyping();
  addMessage('🔍 Extrayendo tareas del modelo y analizando valor PERVAL...', 'ai');

  try {
    const { xml: currentXML } = await modeler.saveXML({ format: true });
    const tasks = extractTasksFromXML(currentXML);

    if (tasks.length === 0) {
      removeTyping();
      addMessage('⚠️ No se encontraron tareas en el diagrama. Genera el diagrama primero.', 'ai', 'err');
      return;
    }

    const rawResponse = await callAPI(
      apiKey,
      buildPervalSystemPrompt(),
      [{ role: 'user', content: buildPervalUserMessage(currentXML, tasks) }]
    );

    removeTyping();

    let data;
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      data = JSON.parse(jsonMatch ? jsonMatch[0] : rawResponse);
    } catch (e) {
      addMessage('❌ No se pudo procesar la respuesta del análisis PERVAL.', 'ai', 'err');
      console.error('PERVAL parse error:', e, rawResponse);
      return;
    }

    showPervalResults(data);
    pervalAnalisado = true;

  } catch (err) {
    removeTyping();
    addMessage(`❌ Error en el análisis PERVAL: ${err.message}`, 'ai', 'err');
    console.error(err);
  } finally {
    pervalBtn.disabled = false;
    updateUI();
  }
}


// ─── LLAMADA A LA API ─────────────────────────────────────────────────────────

async function callAPI(apiKey, systemPrompt, messages) {
  const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.3,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Error en la API');
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

function cleanXML(raw) {
  console.log('=== RAW GPT RESPONSE ===');
  console.log(raw);
  console.log('========================');

  let xml = raw
    .replace(/```xml/gi, '')
    .replace(/```bpmn/gi, '')
    .replace(/```/g, '')
    .trim();

  const idx = xml.indexOf('<?xml');
  if (idx > -1) xml = xml.substring(idx);

  if (!xml.startsWith('<?xml')) {
    const defIdx = xml.indexOf('<definitions');
    if (defIdx > -1) xml = xml.substring(defIdx);
  }

  return xml;
}

// Parsear la respuesta de la entrevista para extraer pregunta y opciones
function parseInterviewResponse(reply) {
  if (reply.includes('[READY_TO_GENERATE]')) {
    return { type: 'ready' };
  }

  const preguntaMatch = reply.match(/PREGUNTA:\s*(.+?)(?:\n|$)/s);
  const opcionesMatch = reply.match(/OPCIONES:\s*(\[.+?\])/s);
  const multiselectMatch = reply.match(/MULTISELECT:\s*(true|false)/i);

  if (preguntaMatch) {
    const pregunta = preguntaMatch[1].trim();
    if (opcionesMatch) {
      try {
        const opciones = JSON.parse(opcionesMatch[1]);
        const multiselect = multiselectMatch ? multiselectMatch[1].toLowerCase() === 'true' : false;
        return { type: 'options', pregunta, opciones, multiselect };
      } catch (e) {
        return { type: 'open', pregunta };
      }
    }
    return { type: 'open', pregunta };
  }

  // Si no sigue el formato, tratar como pregunta abierta
  return { type: 'open', pregunta: reply };
}


// ─── LÓGICA DE ENTREVISTA ─────────────────────────────────────────────────────

async function processInterviewAnswer(answer) {
  const apiKey  = document.getElementById('ai-apikey').value.trim();

  if (!apiKey) {
    addMessage('⚠️ Introduce tu API Key antes de continuar.', 'ai', 'err');
    return;
  }

  preguntaCount++;
  addTyping();

  try {
    const systemPrompt = buildInterviewSystemPrompt().replace('{{COUNT}}', preguntaCount);

    const reply = await callAPI(
      apiKey,
      systemPrompt,
      interviewHistory
    );

    removeTyping();
    interviewHistory.push({ role: 'assistant', content: reply });

    if (preguntaCount >= MAX_PREGUNTAS) {
      // Forzar generación al llegar al límite
      fase = 'diagram';
      updateUI();
      addMessage('✅ ¡Tengo toda la información necesaria! Pulsa el botón para generar el diagrama BPMN.', 'ai', 'ok');
      return;
    }

    const parsed = parseInterviewResponse(reply);

    if (parsed.type === 'ready') {
      fase = 'diagram';
      updateUI();
      addMessage('✅ ¡Tengo toda la información necesaria! Pulsa el botón para generar el diagrama BPMN.', 'ai', 'ok');
    } else if (parsed.type === 'options') {
      addQuestionWithOptions(parsed.pregunta, parsed.opciones, parsed.multiselect);
    } else {
      addMessage(parsed.pregunta, 'ai');
    }

  } catch (err) {
    removeTyping();
    addMessage(`❌ Error: ${err.message}`, 'ai', 'err');
    console.error(err);
  }
}


// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

async function handleSend() {
  const apiKey  = document.getElementById('ai-apikey').value.trim();
  const input   = document.getElementById('ai-scenario').value.trim();
  const sendBtn = document.getElementById('ai-send');

  if (!apiKey) {
    addMessage('⚠️ Introduce tu API Key antes de continuar.', 'ai', 'err');
    return;
  }

  if (fase === 'interview') {
    if (!input) return;
    addMessage(input, 'user');
    document.getElementById('ai-scenario').value = '';
    interviewHistory.push({ role: 'user', content: input });
    sendBtn.disabled = true;
    await processInterviewAnswer(input);
    sendBtn.disabled = false;
    updateUI();
    return;
  }

  if (fase === 'diagram' && !diagramaGenerado) {
    if (input) interviewHistory.push({ role: 'user', content: input });
    if (input) addMessage(input, 'user');
    document.getElementById('ai-scenario').value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '⏳ Generando...';
    addTyping();

    try {
      addMessage('🔍 Generando el diagrama BPMN completo con pools y lanes...', 'ai');
      const userMsg = buildGenerationUserMessage(interviewHistory);
      const rawXML  = await callAPI(
        apiKey,
        buildGenerationSystemPrompt(),
        [{ role: 'user', content: userMsg }]
      );

      removeTyping();
      const xml = cleanXML(rawXML);
      await modeler.importXML(xml);
      container.removeClass('with-error').addClass('with-diagram');
      diagramaGenerado = true;
      updateUI();
      addMessage('✅ ¡Diagrama generado con pools y lanes! Edítalo manualmente o pídeme cambios.', 'ai', 'ok');
    } catch (err) {
      removeTyping();
      addMessage(`❌ Error: ${err.message}`, 'ai', 'err');
      console.error(err);
    } finally {
      sendBtn.disabled = false;
      updateUI();
    }
    return;
  }

  // MODO REFINAMIENTO
  if (!input) return;
  addMessage(input, 'user');
  document.getElementById('ai-scenario').value = '';
  sendBtn.disabled = true;
  sendBtn.textContent = '⏳ Modificando...';
  addTyping();

  try {
    addMessage('🔧 Aplicando modificaciones al diagrama...', 'ai');
    const { xml: currentXML } = await modeler.saveXML({ format: true });
    const userMsg = buildRefinementMessage(input, currentXML);
    const rawXML  = await callAPI(
      apiKey,
      buildGenerationSystemPrompt(),
      [{ role: 'user', content: userMsg }]
    );

    removeTyping();
    const xml = cleanXML(rawXML);
    await modeler.importXML(xml);
    container.removeClass('with-error').addClass('with-diagram');
    addMessage('✅ ¡Diagrama modificado! Puedes seguir pidiendo cambios.', 'ai', 'ok');
  } catch (err) {
    removeTyping();
    addMessage(`❌ Error: ${err.message}`, 'ai', 'err');
    console.error(err);
  } finally {
    sendBtn.disabled = false;
    updateUI();
  }
}


// ─── PRIMERA PREGUNTA ─────────────────────────────────────────────────────────

async function startInterview(initialInput) {
  const apiKey = document.getElementById('ai-apikey').value.trim();
  if (!apiKey) {
    addMessage('⚠️ Introduce tu API Key antes de continuar.', 'ai', 'err');
    return;
  }

  interviewHistory.push({ role: 'user', content: initialInput });
  addTyping();

  try {
    const systemPrompt = buildInterviewSystemPrompt().replace('{{COUNT}}', 0);
    const reply = await callAPI(apiKey, systemPrompt, interviewHistory);
    removeTyping();
    interviewHistory.push({ role: 'assistant', content: reply });

    const parsed = parseInterviewResponse(reply);

    if (parsed.type === 'ready') {
      fase = 'diagram';
      updateUI();
      addMessage('✅ ¡Tengo toda la información! Pulsa el botón para generar el diagrama.', 'ai', 'ok');
    } else if (parsed.type === 'options') {
      addQuestionWithOptions(parsed.pregunta, parsed.opciones, parsed.multiselect);
    } else {
      addMessage(parsed.pregunta, 'ai');
    }
  } catch (err) {
    removeTyping();
    addMessage(`❌ Error: ${err.message}`, 'ai', 'err');
  }
}


// ─── BOOTSTRAP ───────────────────────────────────────────────────────────────

$(function() {

  $('#js-create-diagram').click(function(e) {
    e.stopPropagation();
    e.preventDefault();
    createNewDiagram();
  });

  var downloadLink    = $('#js-download-diagram');
  var downloadSvgLink = $('#js-download-svg');

  $('.buttons a').click(function(e) {
    if (!$(this).is('.active')) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  function setEncoded(link, name, data) {
    var encodedData = encodeURIComponent(data);
    if (data) {
      link.addClass('active').attr({
        'href': 'data:application/bpmn20-xml;charset=UTF-8,' + encodedData,
        'download': name
      });
    } else {
      link.removeClass('active');
    }
  }

  var exportArtifacts = debounce(async function() {
    try {
      const { svg } = await modeler.saveSVG();
      setEncoded(downloadSvgLink, 'diagram.svg', svg);
    } catch (err) {
      console.error('Error saving svg: ', err);
      setEncoded(downloadSvgLink, 'diagram.svg', null);
    }
    try {
      const { xml } = await modeler.saveXML({ format: true });
      setEncoded(downloadLink, 'diagram.bpmn', xml);
    } catch (err) {
      console.error('Error saving XML: ', err);
      setEncoded(downloadLink, 'diagram.bpmn', null);
    }
  }, 500);

  modeler.on('commandStack.changed', exportArtifacts);

  // ── Panel IA ──
  const fab   = document.getElementById('ai-fab');
  const panel = document.getElementById('ai-panel');

  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
  });

  document.getElementById('ai-close').addEventListener('click', () => {
    panel.classList.remove('open');
  });

  document.getElementById('ai-send').addEventListener('click', handleSend);

  document.getElementById('ai-scenario').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) handleSend();
  });

  // Reset completo
  document.getElementById('ai-reset').addEventListener('click', () => {
    fase = 'interview';
    interviewHistory = [];
    diagramaGenerado = false;
    pervalAnalisado = false;
    preguntaCount = 0;
    document.getElementById('ai-messages').innerHTML = `
      <div class="msg ai">
        <div class="msg-av">🤖</div>
        <div class="msg-bubble">
          ¡Hola! Cuéntame brevemente el proceso de negocio que quieres modelar y te haré algunas preguntas con opciones para crear el mejor diagrama BPMN posible.
        </div>
      </div>
    `;
    updateUI();
    createNewDiagram();
  });

  document.getElementById('ai-perval-btn').addEventListener('click', analyzePerval);

  updateUI();
});


// helpers
function debounce(fn, timeout) {
  var timer;
  return function() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, timeout);
  };
}