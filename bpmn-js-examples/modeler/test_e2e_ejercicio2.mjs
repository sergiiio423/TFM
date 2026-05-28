/**
 * E2E - Ejercicio 2: Servicio de catering en línea
 * Flujo: participantes → lane tasks (x4) → actor deliveries (x3) → screenshot escritorio
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const DESKTOP = 'C:/Users/USUARIO/Desktop';
const TIMEOUT  = 120_000; // 2 min por llamada a la API

const PARTICIPANTES = `Los participantes del servicio de catering online son:
- Cliente: actor externo que realiza pedidos, los confirma y puede cancelarlos
- Pasarela de Pago: actor externo que procesa el cobro con tarjeta
- Mensajería: actor externo que entrega los pedidos al cliente
La empresa principal es el Servicio de Catering con los departamentos internos: Dpto Comercial, Dpto Envíos, Cocina y Almacén.`;

const LANES_EXPECTED = 4;
const ACTORS_EXPECTED = 3;

async function waitNoTyping(page) {
  // Espera a que aparezca el indicador de escritura y luego desaparezca
  await page.waitForSelector('#ai-typing', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('ai-typing'), { timeout: TIMEOUT });
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page    = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  page.setDefaultTimeout(20_000);

  page.on('pageerror', err => console.log('⚠️  PAGE ERROR:', err.message.slice(0, 120)));

  console.log('\n=== E2E Ejercicio 2: Catering ===\n');

  // 1. Cargar app
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#ai-fab', { state: 'visible' });
  console.log('✅ App cargada en localhost:8080');

  // 2. Abrir panel IA
  await page.click('#ai-fab');
  await page.waitForSelector('#ai-panel.open');
  console.log('✅ Panel abierto');

  // ── PASO 1: Describir participantes ──────────────────────────────────────────
  await page.fill('#ai-scenario', PARTICIPANTES);
  await page.click('#ai-send');
  console.log('⏳ Esperando estructura de participantes...');

  await waitNoTyping(page);
  await page.waitForSelector('#structure-card', { timeout: TIMEOUT });
  console.log('✅ Tarjeta de estructura visible');

  await page.screenshot({ path: `${DESKTOP}/catering_01_estructura.png` });
  console.log('   📸 catering_01_estructura.png');

  // ── PASO 2: Confirmar estructura ────────────────────────────────────────────
  await page.click('#btn-confirm-main');
  console.log('✅ Estructura confirmada → iniciando lane tasks');

  // ── PASO 3: Lane tasks (4 departamentos) ────────────────────────────────────
  for (let i = 0; i < LANES_EXPECTED; i++) {
    console.log(`⏳ Lane ${i+1}/${LANES_EXPECTED} — esperando tarjeta de tareas...`);
    await waitNoTyping(page);
    await page.waitForSelector('#lane-task-card', { timeout: TIMEOUT });

    // Leer nombre del lane desde la tarjeta
    const laneName = await page.$eval('#lane-task-card .val-header', el =>
      el.textContent.replace(/—.*/, '').replace('📋', '').trim()
    ).catch(() => `Lane ${i+1}`);

    const tasks = await page.$$eval('#lane-task-rows .del-chip-name', els =>
      els.map(e => e.textContent.trim())
    );
    console.log(`   📋 ${laneName}: ${tasks.join(' | ') || '(sin sugerencias)'}`);

    await page.screenshot({ path: `${DESKTOP}/catering_02_lane${i+1}.png` });
    console.log(`   📸 catering_02_lane${i+1}.png`);

    await page.click('#btn-confirm-main');
    console.log(`   ✅ Lane "${laneName}" confirmada`);

    // Pequeña pausa para que se deshabilite la tarjeta actual antes de la siguiente
    await page.waitForTimeout(800);
  }

  // ── PASO 4: Actor deliveries (3 actores externos) ────────────────────────────
  for (let i = 0; i < ACTORS_EXPECTED; i++) {
    console.log(`⏳ Actor ${i+1}/${ACTORS_EXPECTED} — esperando tarjeta de entregas...`);
    await waitNoTyping(page);
    await page.waitForSelector('#actor-card', { timeout: TIMEOUT });

    const actorName = await page.$eval('#actor-card .val-header', el =>
      el.textContent.replace(/—.*/, '').replace('👤', '').trim()
    ).catch(() => `Actor ${i+1}`);

    const deliveries = await page.$$eval('#actor-card .del-chip-name', els =>
      els.map(e => e.textContent.trim())
    );
    console.log(`   👤 ${actorName}: ${deliveries.join(' | ') || '(sin entregas)'}`);

    await page.screenshot({ path: `${DESKTOP}/catering_03_actor${i+1}.png` });

    // Confirmar con el botón dentro de la tarjeta del actor
    await page.click('#btn-actor-confirm');
    console.log(`   ✅ Actor "${actorName}" confirmado`);
    await page.waitForTimeout(800);
  }

  // ── PASO 5: Esperar diagrama completo ────────────────────────────────────────
  console.log('⏳ Esperando diagrama completado...');
  await page.waitForSelector('.msg-bubble.ok', { timeout: 30_000 });
  console.log('✅ Diagrama completado');

  // Screenshot con panel abierto (chat visible)
  await page.screenshot({ path: `${DESKTOP}/catering_04_completo_con_panel.png` });
  console.log('   📸 catering_04_completo_con_panel.png');

  // Cerrar panel y screenshot del canvas completo con fit-to-viewport
  await page.click('#ai-close');
  await page.waitForTimeout(800);
  await page.evaluate(() => window._modeler?.get('canvas').zoom('fit-viewport'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DESKTOP}/catering_05_canvas_final.png` });
  console.log('   📸 catering_05_canvas_final.png  ← RESULTADO FINAL');

  // ── Guardar XML ──────────────────────────────────────────────────────────────
  const xml = await page.evaluate(() => window._lastGeneratedXML || null);
  if (xml) {
    writeFileSync(`${DESKTOP}/catering_ejercicio2.bpmn`, xml);
    console.log(`\n   💾 XML guardado → ${DESKTOP}/catering_ejercicio2.bpmn`);
  }

  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
