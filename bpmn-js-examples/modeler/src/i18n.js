// ─── i18n: ES / EN ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'bpmnAiLang';

export const I18N = {
  es: {
    // ── Cabecera / chrome estático ──
    subtitle:        'Generación iterativa de procesos',
    resetTitle:      'Nueva conversación',
    fabTitle:        'Abrir asistente IA',
    langSwitchTitle: 'Cambiar idioma',
    micTitle:        'Hablar para dictar',
    micUnavailable:  'El reconocimiento de voz no está disponible en este navegador',
    phase1: '1·Usuarios',
    phase2: '2·Funcionalidad',
    phase3: '3·Valores',
    phase4: '4·Diagrama',

    // ── Mensajes de bienvenida ──
    welcomeInitial:
      '¡Hola! Vamos a construir tu diagrama BPMN paso a paso.<br><br>' +
      '<b>Para empezar</b>, cuéntame en un solo mensaje:<br>' +
      '• <b>Quiénes participan</b> en el proceso: tus clientes, proveedores, transportistas y los departamentos internos de tu empresa.<br>' +
      '• <b>Cómo funciona el proceso</b>: qué hace cada uno, qué decisiones se toman y qué mensajes se intercambian con los actores externos.<br><br>' +
      'Cuanto más detalle des, más preciso será el resultado. Si más adelante se te olvida algo, podrás añadirlo en cualquier momento con el botón «➕ Añadir información».',
    welcomeReset:
      '¡Hola! Describe el proceso de e-commerce que quieres modelar.<br><br>' +
      'El flujo iterativo es:<br>' +
      '<b>1·</b> Identifico los canales/usuarios del sistema (pools y lanes) → los dibujo<br>' +
      '<b>2·</b> Defines qué entrega el proceso a cada canal externo<br>' +
      '<b>3·</b> Genero el diagrama centrado en esas entregas de valor<br>' +
      '<b>4·</b> Opcionalmente, calculas el valor PERVAL para el canal que elijas',

    // ── updateUI(): textos por fase ──
    describeBtn:               '→ Analizar proceso',
    describePlaceholder:       'Describe quiénes participan en tu proceso (clientes, proveedores, tu empresa y sus departamentos...) y cómo funciona (tareas, decisiones, mensajes a actores externos...)',
    hintCtrlEnter:              'Ctrl+Enter para enviar',
    confirmStructPlaceholder:  'Escribe aquí los cambios que quieres aplicar...',
    hintConfirmStruct:          'Escribe un cambio y pulsa ✏️ Modificar, o confirma directamente',
    flowStartPlaceholder:      'Usa la tarjeta para definir el inicio del proceso...',
    hintFlowStart:              'Confirma cómo empieza el proceso',
    flowStepPlaceholder:       'Usa la tarjeta para confirmar el siguiente paso...',
    hintFlowStep:               'Paso {n} — confirma o edita',
    flowBranchesPlaceholder:   'Usa la tarjeta para definir los casos de la puerta...',
    hintFlowBranches:           'Define los casos/ramas de la puerta',
    flowBranchStepPlaceholder: 'Usa la tarjeta para confirmar el siguiente paso del caso...',
    hintFlowBranchStep:         'Confirma o edita el paso de este caso',
    addInfoBtn:                 '➕ Añadir información',
    addInfoPlaceholder:         '¿Olvidaste algo? Añádelo aquí en cualquier momento (opcional)...',
    addInfoConfirmedMsg:        '✅ Información añadida. La tendré en cuenta en los próximos pasos.',
    hintAddInfoSuffix:          ' · Puedes añadir información extra abajo.',
    refineBtn:                 '✦ Modificar diagrama',
    refinePlaceholder:         'Ej: Añade un gateway de validación, renombra el lane de logística...',
    pervalBtnReanalyze:        '🔄 Re-analizar PERVAL',
    pervalBtnAnalyze:          '🔍 Analizar valor PERVAL',
    hintRefine:                 'Ctrl+Enter para enviar · ↺ para nueva sesión',
    btnConfirmMain: '✅ Confirmar',
    btnModifyMain:  '✏️ Modificar',

    // ── Tarjeta de estructura ──
    structNone:       'Ninguno',
    structSinglePool: 'Piscina única (sin departamentos)',
    structLegend:     '🧑‍💼 cliente (recibe el valor) · 🤝 colaborador',
    structExtLabel:   'CLIENTES Y COLABORADORES EXTERNOS',
    structOrgLabel:   'ORGANIZACIÓN PRINCIPAL',
    structLanesLabel: 'DEPARTAMENTOS (LANES)',

    // ── Tarjeta de inicio ──
    startNoneYet:     'Sin inicios. Añade uno abajo.',
    startHeader:      '🏁 Inicio del proceso',
    startSubtitle:    '¿Cómo empieza el proceso? Puede haber varios inicios en paralelo.',
    startAddBtn:      '+ añadir otro inicio',
    startConfirmBtn:  '✅ Confirmar inicio(s)',
    startNoTrigger:   'Sin disparador',
    startMsgTrigger:  '📩 Mensaje recibido',
    startFromActor:   'de {actor}',
    defaultStartName: 'Inicio',

    // ── Tarjeta de siguiente paso ──
    stepHeaderBranch:     '🔀 Caso «{branch}» — Paso {n}',
    stepHeaderMain:       '➡️ Paso {n}',
    stepSubtitleBranch:   '¿Qué pasa en el caso «{branch}» de la puerta «{gateway}»?',
    stepSubtitleMain:     '¿Qué pasa ahora y quién lo hace? Edita si hace falta.',
    stepFinalBranch:      'Este es el último paso de este caso',
    stepFinalMain:        'Este es el último paso del proceso',
    stepRecipient:        'Destinatario:',
    stepEndProcessLabel:  'El proceso termina en este caso (Fin propio; la rama no converge)',
    btnConfirmDefineCases:  '✅ Confirmar y definir casos',
    btnConfirmCloseCaseMsg: '✅ Confirmar y cerrar caso (mensaje final)',
    btnConfirmFinishMsg:    '✅ Confirmar y finalizar (mensaje final)',
    btnConfirmCloseCase:    '✅ Confirmar y cerrar caso',
    btnConfirmFinish:       '✅ Confirmar y finalizar',
    btnConfirmContinue:     '✅ Confirmar y continuar',

    // ── Tarjeta de casos de gateway ──
    branchesHeader:     '🔀 Casos para «{name}»',
    branchesSubtitle:   'Define las ramas que salen de esta puerta (mínimo 2). Después definiremos los pasos de cada caso, uno a uno.',
    branchesAddBtn:     '+ añadir caso',
    branchesConfirmBtn: '✅ Confirmar casos',
    defaultCaseName:    'Caso {n}',

    // ── Selector de actor PERVAL ──
    pervalActorQuestion: '¿Para qué actor quieres calcular el valor PERVAL?',
    pervalAllActors:     '📊 Todos los actores',
    pervalOtherCollabs:  'Otros colaboradores externos (no clientes):',
    pervalAllActorsUserMsg: 'Todos los actores',

    // ── Resultados PERVAL ──
    pervalGlobalLbl:     'Valoración global',
    pervalHeader:        '📊 Análisis PERVAL',
    pervalClassifByTask: 'Clasificación por tarea',
    pervalSummaryByDim:  'Resumen por dimensión',
    pervalPaintBtn:      '🎨 Pintar diagrama por valor',
    pervalRemoveBtn:     '↩️ Quitar',

    // ── Dimensiones PERVAL ──
    dimQuality:   'Calidad',
    dimPrice:     'Precio',
    dimEmotional: 'Emocional',
    dimSocial:    'Social',
    dimInterno:   'Interno',

    // ── Etiquetas de tipo de elemento ──
    elTask:               'Tarea',
    elSendTask:           'Envío',
    elIntermediateCatch:  'Espera msg',
    elIntermediateThrow:  'Lanza msg',
    elCompensation:       'Compensación',
    elTimer:              'Temporizador',
    elEndMessage:         'Fin con mensaje',
    elExclusiveGw:        'Gateway XOR',
    elParallelGw:         'Gateway AND',
    elStart:              'Inicio',
    elEnd:                'Fin',
    defaultNextStepName:  'Siguiente paso',
    defaultStepName:      'Paso',

    // ── Flujo: mensajes de estado/error ──
    errStructure: '❌ No pude identificar la estructura. Prueba con más detalle.',
    structDrawnMsg:
      'He dibujado la estructura en el lienzo:<br>' +
      '🏢 <b>{org}</b> → {lanes}<br>' +
      '👤 Canales externos: <b>{ext}</b><br><br>' +
      '{resumen}{lanesQuestion}<br><br>' +
      '¿Es correcta? Confirma para continuar y empezar a definir el proceso paso a paso.',
    noLanesText: 'sin departamentos (piscina única)',
    noneExt:     'ninguno',
    lanesQuestionMsg:
      '<br><br>⚠️ No has mencionado departamentos, así que he dibujado tu organización como una <b>única piscina sin calles</b>. ' +
      'Si quieres dividirla en departamentos, escríbelo como modificación (p.ej. «añade los departamentos Ventas y Almacén»); ' +
      'si no, confirma para continuar.',
    errorPrefix: '❌ Error: {msg}',

    structConfirmedUser: 'Estructura confirmada ✅',

    flowModeHeader:       '🚀 ¿Cómo quieres definir el proceso?',
    flowModeSubtitle:     'Paso a paso: revisas y editas cada sugerencia antes de continuar. Automático: genero todo el proceso de una vez con el mismo razonamiento, y podrás revisarlo y modificarlo al final.',
    flowModeManualBtn:    '🪜 Paso a paso',
    flowModeAutoBtn:      '⚡ Generar todo de una vez',
    flowModeManualChosen: 'Paso a paso ✅',
    flowModeAutoChosen:   'Generar todo de una vez ✅',
    autoModeRunningMsg:   '🤖 Generando el proceso completo automáticamente, sin pedir confirmación en cada paso...',

    errModify:     '❌ No pude aplicar los cambios. Intenta de nuevo.',
    structUpdated: 'Estructura actualizada ✅ ¿Está bien ahora?',

    defaultOrgName: 'Organización',

    searchingStart: '🏁 Buscando el punto de inicio del proceso...',

    startTriggerMsg:    ' (📩 mensaje de {actor})',
    errDiagramUpdate:   '❌ Error al actualizar el diagrama: {msg}',
    startConfirmedMsg:  'Inicio confirmado ✅ Ahora vamos paso a paso: te iré preguntando qué pasa después y quién lo hace.',

    thinkingNextStep:   '➡️ Paso {n} — pensando qué pasa después...',
    limitReachedStep:   '⚠️ Se alcanzó el límite de pasos del asistente. Marca este paso como el último.',

    diagramComplete: '✅ ¡Diagrama completado! Puedes pedir modificaciones o analizar el valor PERVAL.',

    identifyingCases: '🔀 Puerta «{name}»: identificando los casos/ramas...',

    caseStepThinking:  '🔀 Caso «{branch}» ({i}/{total}) — paso {n}...',
    limitReachedBranch: '⚠️ Límite de pasos de la rama alcanzado. Marca este paso como el último del caso.',

    casesCompletedConverge:       '✅ Casos de «{name}» completados. Las ramas convergen y el proceso continúa.',
    diagramCompleteAllBranches:   '✅ ¡Diagrama completado! Todas las ramas terminan el proceso. Puedes pedir modificaciones o analizar el valor PERVAL.',

    diagramModified: '✅ ¡Diagrama modificado!',

    calculatingPerval:  '🔍 Calculando el valor PERVAL{forActor}...',
    forActorSuffix:     ' para <b>{actor}</b>',
    noElementsToAnalyze:'⚠️ No hay elementos que analizar en el diagrama.',
    pervalParseError:   '❌ No se pudo procesar la respuesta PERVAL.',
    pervalError:        '❌ Error PERVAL: {msg}',

    micError: '⚠️ No se pudo usar el micrófono ({err}).',

    errNoDiagramSection: 'El modelo generó el proceso sin sección de diagrama visual. Pulsa de nuevo para reintentar.',

    useChromeFirefox: 'Usa Chrome o Firefox.',
  },

  en: {
    // ── Header / static chrome ──
    subtitle:        'Iterative process generation',
    resetTitle:      'New conversation',
    fabTitle:        'Open AI assistant',
    langSwitchTitle: 'Switch language',
    micTitle:        'Speak to dictate',
    micUnavailable:  'Speech recognition is not available in this browser',
    phase1: '1·Users',
    phase2: '2·Functionality',
    phase3: '3·Values',
    phase4: '4·Diagram',

    // ── Welcome messages ──
    welcomeInitial:
      "Hello! Let's build your BPMN diagram step by step.<br><br>" +
      '<b>To get started</b>, tell me in a single message:<br>' +
      '• <b>Who takes part</b> in the process: your clients, suppliers, carriers and your company\'s internal departments.<br>' +
      '• <b>How the process works</b>: what each one does, what decisions are made and what messages are exchanged with external actors.<br><br>' +
      'The more detail you give, the more accurate the result will be. If you forget something later, you can add it at any time with the "➕ Add information" button.',
    welcomeReset:
      'Hello! Describe the e-commerce process you want to model.<br><br>' +
      'The iterative flow is:<br>' +
      "<b>1·</b> I identify the system's channels/users (pools and lanes) → I draw them<br>" +
      '<b>2·</b> You define what the process delivers to each external channel<br>' +
      '<b>3·</b> I generate the diagram focused on those value deliveries<br>' +
      '<b>4·</b> Optionally, you calculate the PERVAL value for the channel you choose',

    // ── updateUI(): texts per phase ──
    describeBtn:               '→ Analyze process',
    describePlaceholder:       'Describe who takes part in your process (clients, suppliers, your company and its departments...) and how it works (tasks, decisions, messages to external actors...)',
    hintCtrlEnter:              'Ctrl+Enter to send',
    confirmStructPlaceholder:  'Write here the changes you want to apply...',
    hintConfirmStruct:          'Write a change and click ✏️ Modify, or confirm directly',
    flowStartPlaceholder:      'Use the card to define how the process starts...',
    hintFlowStart:              'Confirm how the process starts',
    flowStepPlaceholder:       'Use the card to confirm the next step...',
    hintFlowStep:               'Step {n} — confirm or edit',
    flowBranchesPlaceholder:   "Use the card to define the gateway's cases...",
    hintFlowBranches:           "Define the gateway's cases/branches",
    flowBranchStepPlaceholder: "Use the card to confirm the case's next step...",
    hintFlowBranchStep:         "Confirm or edit this case's step",
    addInfoBtn:                 '➕ Add information',
    addInfoPlaceholder:         'Forgot something? Add it here at any time (optional)...',
    addInfoConfirmedMsg:        '✅ Information added. I will take it into account in the next steps.',
    hintAddInfoSuffix:          ' · You can add extra information below.',
    refineBtn:                 '✦ Modify diagram',
    refinePlaceholder:         'E.g.: Add a validation gateway, rename the logistics lane...',
    pervalBtnReanalyze:        '🔄 Re-analyze PERVAL',
    pervalBtnAnalyze:          '🔍 Analyze PERVAL value',
    hintRefine:                 'Ctrl+Enter to send · ↺ for a new session',
    btnConfirmMain: '✅ Confirm',
    btnModifyMain:  '✏️ Modify',

    // ── Structure card ──
    structNone:       'None',
    structSinglePool: 'Single pool (no departments)',
    structLegend:     '🧑‍💼 client (receives the value) · 🤝 collaborator',
    structExtLabel:   'EXTERNAL CLIENTS AND COLLABORATORS',
    structOrgLabel:   'MAIN ORGANIZATION',
    structLanesLabel: 'DEPARTMENTS (LANES)',

    // ── Start card ──
    startNoneYet:     'No starts yet. Add one below.',
    startHeader:      '🏁 Process start',
    startSubtitle:    'How does the process start? There can be several parallel starts.',
    startAddBtn:      '+ add another start',
    startConfirmBtn:  '✅ Confirm start(s)',
    startNoTrigger:   'No trigger',
    startMsgTrigger:  '📩 Message received',
    startFromActor:   'from {actor}',
    defaultStartName: 'Start',

    // ── Next step card ──
    stepHeaderBranch:     '🔀 Case "{branch}" — Step {n}',
    stepHeaderMain:       '➡️ Step {n}',
    stepSubtitleBranch:   'What happens in case "{branch}" of gateway "{gateway}"?',
    stepSubtitleMain:     'What happens now and who does it? Edit if needed.',
    stepFinalBranch:      'This is the last step of this case',
    stepFinalMain:        'This is the last step of the process',
    stepRecipient:        'Recipient:',
    stepEndProcessLabel:  'The process ends in this case (own End event; the branch does not converge)',
    btnConfirmDefineCases:  '✅ Confirm and define cases',
    btnConfirmCloseCaseMsg: '✅ Confirm and close case (final message)',
    btnConfirmFinishMsg:    '✅ Confirm and finish (final message)',
    btnConfirmCloseCase:    '✅ Confirm and close case',
    btnConfirmFinish:       '✅ Confirm and finish',
    btnConfirmContinue:     '✅ Confirm and continue',

    // ── Gateway cases card ──
    branchesHeader:     '🔀 Cases for "{name}"',
    branchesSubtitle:   "Define the branches coming out of this gateway (minimum 2). Then we'll define the steps of each case, one by one.",
    branchesAddBtn:     '+ add case',
    branchesConfirmBtn: '✅ Confirm cases',
    defaultCaseName:    'Case {n}',

    // ── PERVAL actor selector ──
    pervalActorQuestion: 'Which actor do you want to calculate the PERVAL value for?',
    pervalAllActors:     '📊 All actors',
    pervalOtherCollabs:  'Other external collaborators (not clients):',
    pervalAllActorsUserMsg: 'All actors',

    // ── PERVAL results ──
    pervalGlobalLbl:     'Overall assessment',
    pervalHeader:        '📊 PERVAL Analysis',
    pervalClassifByTask: 'Classification by task',
    pervalSummaryByDim:  'Summary by dimension',
    pervalPaintBtn:      '🎨 Paint diagram by value',
    pervalRemoveBtn:     '↩️ Remove',

    // ── PERVAL dimensions ──
    dimQuality:   'Quality',
    dimPrice:     'Price',
    dimEmotional: 'Emotional',
    dimSocial:    'Social',
    dimInterno:   'Internal',

    // ── Element type labels ──
    elTask:               'Task',
    elSendTask:           'Send',
    elIntermediateCatch:  'Wait msg',
    elIntermediateThrow:  'Throw msg',
    elCompensation:       'Compensation',
    elTimer:              'Timer',
    elEndMessage:         'End with message',
    elExclusiveGw:        'XOR Gateway',
    elParallelGw:         'AND Gateway',
    elStart:              'Start',
    elEnd:                'End',
    defaultNextStepName:  'Next step',
    defaultStepName:      'Step',

    // ── Flow: status/error messages ──
    errStructure: "❌ I couldn't identify the structure. Try with more detail.",
    structDrawnMsg:
      "I've drawn the structure on the canvas:<br>" +
      '🏢 <b>{org}</b> → {lanes}<br>' +
      '👤 External channels: <b>{ext}</b><br><br>' +
      '{resumen}{lanesQuestion}<br><br>' +
      'Is this correct? Confirm to continue and start defining the process step by step.',
    noLanesText: 'no departments (single pool)',
    noneExt:     'none',
    lanesQuestionMsg:
      "<br><br>⚠️ You haven't mentioned any departments, so I've drawn your organization as a <b>single pool without lanes</b>. " +
      'If you want to split it into departments, write it as a modification (e.g. "add the Sales and Warehouse departments"); ' +
      'otherwise, confirm to continue.',
    errorPrefix: '❌ Error: {msg}',

    structConfirmedUser: 'Structure confirmed ✅',

    flowModeHeader:       '🚀 How do you want to define the process?',
    flowModeSubtitle:     "Step by step: review and edit each suggestion before continuing. Automatic: I'll generate the whole process at once with the same reasoning, and you can review and modify it at the end.",
    flowModeManualBtn:    '🪜 Step by step',
    flowModeAutoBtn:      '⚡ Generate it all at once',
    flowModeManualChosen: 'Step by step ✅',
    flowModeAutoChosen:   'Generate it all at once ✅',
    autoModeRunningMsg:   "🤖 Generating the whole process automatically, without asking for confirmation at each step...",

    errModify:     "❌ I couldn't apply the changes. Try again.",
    structUpdated: 'Structure updated ✅ Is it correct now?',

    defaultOrgName: 'Organization',

    searchingStart: '🏁 Looking for the process start point...',

    startTriggerMsg:    ' (📩 message from {actor})',
    errDiagramUpdate:   '❌ Error updating the diagram: {msg}',
    startConfirmedMsg:  "Start confirmed ✅ Now let's go step by step: I'll ask you what happens next and who does it.",

    thinkingNextStep:   '➡️ Step {n} — thinking about what happens next...',
    limitReachedStep:   "⚠️ The assistant's step limit has been reached. Mark this step as the last one.",

    diagramComplete: '✅ Diagram complete! You can request modifications or analyze the PERVAL value.',

    identifyingCases: '🔀 Gateway "{name}": identifying cases/branches...',

    caseStepThinking:  '🔀 Case "{branch}" ({i}/{total}) — step {n}...',
    limitReachedBranch: "⚠️ The branch's step limit has been reached. Mark this step as the last one of the case.",

    casesCompletedConverge:       '✅ Cases for "{name}" completed. The branches converge and the process continues.',
    diagramCompleteAllBranches:   '✅ Diagram complete! All branches end the process. You can request modifications or analyze the PERVAL value.',

    diagramModified: '✅ Diagram modified!',

    calculatingPerval:  '🔍 Calculating the PERVAL value{forActor}...',
    forActorSuffix:     ' for <b>{actor}</b>',
    noElementsToAnalyze:'⚠️ There are no elements to analyze in the diagram.',
    pervalParseError:   '❌ Could not process the PERVAL response.',
    pervalError:        '❌ PERVAL Error: {msg}',

    micError: '⚠️ Could not use the microphone ({err}).',

    errNoDiagramSection: 'The model generated the process without a visual diagram section. Click again to retry.',

    useChromeFirefox: 'Use Chrome or Firefox.',
  }
};

let currentLang = 'es';
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && I18N[stored]) currentLang = stored;
} catch(e) { /* localStorage no disponible */ }

export function getLang() { return currentLang; }

export function setLang(lang) {
  if (!I18N[lang] || lang === currentLang) return false;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch(e) {}
  return true;
}

export function t(key, vars) {
  let str = (I18N[currentLang] && I18N[currentLang][key] !== undefined)
    ? I18N[currentLang][key]
    : (I18N.es[key] !== undefined ? I18N.es[key] : key);
  if (vars) {
    Object.keys(vars).forEach(k => { str = str.split(`{${k}}`).join(vars[k]); });
  }
  return str;
}

export function recognitionLang() { return currentLang === 'en' ? 'en-US' : 'es-ES'; }

// Directiva de idioma para añadir al final de los prompts de la IA: el
// esquema JSON (claves y valores fijos enumerados) se mantiene siempre en
// español/inglés tal como se especifica en el prompt; solo el contenido en
// lenguaje natural generado por el modelo debe adaptarse al idioma elegido.
export function langDirective() {
  if (currentLang === 'en') {
    return '\n\nIMPORTANT — LANGUAGE: Generate all human-readable content you produce ' +
      '(names, "resumen", "valor", "justificacion", "valorGeneral", case/branch names, summaries, ' +
      'descriptions, etc.) in English. However, keep all JSON field/key names and every fixed ' +
      'code/enum value mentioned in the instructions above exactly as specified — e.g. "tipo" values ' +
      'like "task"/"sendTask"/"exclusiveGateway"/etc., "rol" values "cliente"/"colaborador", trigger ' +
      'values "message"/"none", and PERVAL dimension keys "Quality"/"Price"/"Emotional"/"Social"/"Interno" ' +
      '— do not translate those.';
  }
  return '';
}
