/**
 * Test E2E del plugin AI con el proceso de Catering.
 * Corre con: node test_e2e_catering.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const CATERING_DESC = `El servicio de Catering online permite al cliente elegir alimentos desde Internet.
El cliente se identifica, añade alimentos al carrito y confirma la compra (perfil, hora de entrega, dirección, tarjeta).
La empresa tiene 4 departamentos internos: Dpto Comercial, Dpto Envíos, Cocina y Almacén.
Participantes externos: Cliente, Pasarela de Pago, Mensajería.
El Dpto Comercial recibe el pedido y solicita el cobro a la Pasarela de Pago.
Si el pago es correcto, envía email de confirmación al cliente.
Según el tipo de alimento: los fríos los prepara el Almacén, los calientes los cocina la Cocina 1,5h antes.
El Dpto Envíos coordina con Mensajería la entrega al cliente.
Al día siguiente el Dpto Comercial envía un cuestionario de calidad al cliente.`;

const TIMEOUT_API = 90_000; // 90 s por llamada API

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page    = await browser.newPage();
  page.setDefaultTimeout(15_000);

  console.log('\n=== TEST E2E CATERING ===\n');

  // ── 1. Abrir la app ────────────────────────────────────────────────────────
  // Capturar errores JS del navegador
  const jsErrors = [];
  page.on('pageerror', err => { jsErrors.push(err.message); console.log('  ⚠️  PAGE ERROR:', err.message.substring(0, 120)); });
  page.on('console',   msg => { if (msg.type() === 'error') console.log('  ⚠️  CONSOLE ERR:', msg.text().substring(0, 120)); });

  await page.goto('http://localhost:8081');
  await page.waitForSelector('#ai-fab', { state: 'visible' });
  console.log('✅ App cargada');

  // ── 2. Abrir el panel ──────────────────────────────────────────────────────
  await page.click('#ai-fab');
  await page.waitForSelector('#ai-panel.open', { state: 'visible' });
  console.log('✅ Panel abierto');

  // ── 3. FASE 1: describir el proceso ────────────────────────────────────────
  await page.fill('#ai-scenario', CATERING_DESC);
  await page.click('#ai-send');
  console.log('⏳ Esperando identificación de estructura (hasta 90 s)...');

  // Esperar la tarjeta de estructura (btn-confirm-struct)
  await page.waitForSelector('#btn-confirm-struct', { timeout: TIMEOUT_API });
  const phase2 = await page.$eval('#phase-2', el => el.className);
  console.log(`✅ Tarjeta de estructura visible  [phase-2: ${phase2}]`);

  // Screenshot: estructura
  await page.screenshot({ path: 'ss_01_estructura.png', fullPage: false });
  console.log('   📸 ss_01_estructura.png');

  // Verificar canales detectados en el DOM
  const chips = await page.$$eval('.struct-chip', els => els.map(e => e.textContent.trim()));
  console.log('   Chips detectados:', chips.join(' | '));

  // ── 4. FASE 2: confirmar estructura → ciclo actor a actor ──────────────────
  await page.click('#btn-confirm-struct');
  console.log('⏳ Ciclo actor a actor (hasta 90 s por actor)...');

  // Procesar cada actor: esperar tarjeta → confirmar (sin modificar sugerencias)
  const extActors = await page.$$eval('.struct-chip.ext-chip', els => els.map(e => e.textContent.trim()));
  const nActors = extActors.filter(t => t.startsWith('👤')).length || 3;
  console.log(`   Actores externos detectados: ${nActors}`);

  for (let i = 0; i < nActors; i++) {
    console.log(`   ⏳ Actor ${i+1}/${nActors}...`);
    await page.waitForSelector('#actor-card', { timeout: TIMEOUT_API });
    await page.screenshot({ path: `ss_actor_${i+1}.png`, fullPage: false });
    console.log(`   📸 ss_actor_${i+1}.png`);

    const deliveries = await page.$$eval('.del-chip-name', els => els.map(e => e.textContent.trim()));
    console.log(`   Entregas sugeridas: ${deliveries.join(' | ') || '(ninguna)'}`);

    // Confirmar las sugerencias tal cual
    await page.click('#btn-actor-confirm');

    // Esperar a que la tarjeta desaparezca antes de buscar la siguiente
    await page.waitForFunction(() => !document.getElementById('actor-card') ||
      document.getElementById('actor-card').querySelectorAll('button:not(:disabled)').length === 0,
      { timeout: 5000 }).catch(() => {});
  }

  // ── 5. Esperar mensaje de diagrama completado ────────────────────────────
  const DIAG_TIMEOUT = 30_000;
  try {
    await page.waitForSelector('.msg-bubble.ok', { timeout: DIAG_TIMEOUT });
  } catch(e) {
    await page.screenshot({ path: 'ss_03_timeout.png' });
    console.log('⚠️  Timeout esperando mensaje ok. Screenshot: ss_03_timeout.png');
    throw e;
  }

  const phase4 = await page.$eval('#phase-4', el => el.className);
  console.log(`✅ Diagrama completado  [phase-4: ${phase4}]`);

  await page.screenshot({ path: 'ss_03_diagrama.png', fullPage: false });
  console.log('   📸 ss_03_diagrama.png');

  // Cerrar el panel para ver el canvas completo
  await page.click('#ai-close');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'ss_04_canvas_full.png', fullPage: false });
  console.log('   📸 ss_04_canvas_full.png (canvas sin panel)');

  // ── 6. Extraer y validar el XML generado ──────────────────────────────────
  // Esperar a que el link de descarga se active (modeler.on('commandStack.changed'))
  let finalXML = null;
  try {
    await page.waitForSelector('#js-download-diagram.active', { timeout: 8000 });
    const href = await page.$eval('#js-download-diagram', el => el.getAttribute('href'));
    if (href && href.startsWith('data:')) {
      finalXML = decodeURIComponent(href.split(',')[1]);
    }
  } catch(e) {
    // Intentar via evaluate si el link no está activo
    finalXML = await page.evaluate(() => window._lastGeneratedXML || null).catch(() => null);
  }

  if (finalXML) {
    writeFileSync('catering_e2e_result.bpmn', finalXML);
    console.log(`\n   XML guardado → catering_e2e_result.bpmn (${finalXML.length} chars)`);

    // Contar BPMNEdge de messageFlows (deben tener waypoints verticales)
    const mfCount    = (finalXML.match(/<messageFlow/g) || []).length;
    const mfEdges    = (finalXML.match(/bpmnElement="(MF|MessageFlow|mf)/g) || []).length;
    const hasEdgeMF  = mfEdges >= mfCount && mfCount > 0;
    // Verificar waypoints no-horizontales en messageFlow edges (y distintas)
    const mfEdgeBlocks = [...finalXML.matchAll(/<bpmndi:BPMNEdge[^>]*bpmnElement="(MF|MessageFlow)[^"]*"[^>]*>([\s\S]*?)<\/bpmndi:BPMNEdge>/gi)];
    const hasVertWaypoints = mfEdgeBlocks.length > 0 && mfEdgeBlocks.every(m => {
      const pts = [...m[2].matchAll(/y="(\d+)"/g)].map(p => parseInt(p[1]));
      return pts.length >= 2 && pts[0] !== pts[pts.length-1]; // y distintas = flecha vertical
    });

    const checks = {
      'bpmndi:BPMNDiagram':          finalXML.includes('bpmndi:BPMNDiagram'),
      'Pool Cliente':                 finalXML.includes('Cliente'),
      'Pool Mensajería':              finalXML.includes('ensajer'),
      'Pasarela de Pago':             finalXML.includes('Pasarela'),
      'Lane Dpto Comercial':          finalXML.toLowerCase().includes('comercial'),
      'Lane Cocina':                  finalXML.toLowerCase().includes('cocina'),
      'Lane Almacén':                 finalXML.toLowerCase().includes('almac'),
      'sendTask':                     finalXML.includes('<sendTask'),
      'messageFlow en collaboration': finalXML.includes('<messageFlow'),
      'BPMNEdge por cada messageFlow':hasEdgeMF,
      'Waypoints verticales (↕)':     hasVertWaypoints,
      'exclusiveGateway':             finalXML.includes('exclusiveGateway'),
      'startEvent':                   finalXML.includes('<startEvent'),
      'endEvent':                     finalXML.includes('<endEvent'),
    };
    console.log('\n=== VALIDACIÓN XML ===');
    let pass = 0;
    Object.entries(checks).forEach(([k, v]) => {
      console.log((v ? '✅' : '❌') + ' ' + k);
      if (v) pass++;
    });
    const total = Object.keys(checks).length;
    console.log(`\nResultado: ${pass}/${total} checks`);

    const types = ['userTask','serviceTask','sendTask','exclusiveGateway','startEvent','endEvent','messageFlow','sequenceFlow'];
    console.log('\nConteo de elementos:');
    types.forEach(t => {
      const n = (finalXML.match(new RegExp(`<${t}[ >]`, 'g')) || []).length;
      if (n > 0) console.log(`  ${t}: ${n}`);
    });
  } else {
    console.log('⚠️  No se pudo extraer el XML final (descarga no activa aún)');
  }

  // ── 7. Verificar que NO hay mensaje de error visible ──────────────────────
  const errorMsgs = await page.$$eval('.msg-bubble.err', els => els.map(e => e.textContent.trim()));
  if (errorMsgs.length > 0) {
    console.log('\n⚠️  Mensajes de error detectados:');
    errorMsgs.forEach(m => console.log('  ❌', m.substring(0, 120)));
  } else {
    console.log('\n✅ Sin errores en el panel');
  }

  console.log('\n=== TEST COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR EN TEST:', err.message);
  process.exit(1);
});
