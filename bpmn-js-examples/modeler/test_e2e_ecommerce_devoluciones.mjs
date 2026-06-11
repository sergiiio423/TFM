/**
 * E2E - Devoluciones e-commerce
 * Flujo: participantes → confirmar estructura → describir flujo →
 *        flow_start (inicio) → flow_step (xN, asistente paso a paso) → screenshot
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const DESKTOP = 'C:/Users/USUARIO/Desktop';
const TIMEOUT  = 120_000; // 2 min por llamada a la API
const MAX_STEPS = 15;

const PARTICIPANTES = `En mi proceso participan: el cliente que compra online, una pasarela
de pago que gestiona cobros y reembolsos, y una empresa de transporte
que recoge los paquetes devueltos. Por parte de mi empresa intervienen
dos departamentos: Atención al Cliente y Almacén.`;

const FLUJO = `El cliente solicita la devolución de un pedido indicando el motivo y
el número de pedido (mensaje de inicio). Atención al Cliente revisa la
solicitud y comprueba si el motivo es válido y está dentro del plazo de
devolución de 14 días.

- Si el motivo NO es válido: se envía un email al cliente rechazando la
  devolución y el proceso termina.

- Si el motivo es válido: Atención al Cliente solicita la recogida del
  paquete a la empresa de transporte (mensaje).

Cuando Almacén recibe el paquete devuelto, lo inspecciona para
comprobar su estado.

- Si el producto está en buen estado: Atención al Cliente solicita el
  reembolso a la pasarela de pago (mensaje) y envía un email de
  confirmación del reembolso al cliente. Fin del proceso.

- Si el producto está dañado o incompleto: se envía un email al cliente
  informando de que no procede el reembolso. Fin del proceso.`;

async function waitNoTyping(page) {
  await page.waitForSelector('#ai-typing', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('ai-typing'), { timeout: TIMEOUT });
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page    = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  page.setDefaultTimeout(20_000);

  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('⚠️  PAGE ERROR:', err.message.slice(0, 200)); });
  page.on('console', msg => { if (msg.type() === 'error') console.log('⚠️  CONSOLE ERROR:', msg.text().slice(0, 200)); });

  console.log('\n=== E2E Devoluciones E-commerce (asistente paso a paso) ===\n');

  // 1. Cargar app
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#ai-fab', { state: 'visible' });
  console.log('✅ App cargada en localhost:8080');

  // 2. Abrir panel IA
  await page.click('#ai-fab');
  await page.waitForSelector('#ai-panel.open');
  console.log('✅ Panel abierto');

  // ── PASO 1: Describir participantes ──────────────────────────────────────
  await page.fill('#ai-scenario', PARTICIPANTES);
  await page.click('#ai-send');
  console.log('⏳ Esperando estructura de participantes...');

  await waitNoTyping(page);
  await page.waitForSelector('#structure-card', { timeout: TIMEOUT });
  console.log('✅ Tarjeta de estructura visible');
  await page.screenshot({ path: `${DESKTOP}/devol_01_estructura.png` });

  // ── PASO 2: Confirmar estructura ─────────────────────────────────────────
  await page.click('#btn-confirm-main');
  console.log('✅ Estructura confirmada');
  await page.waitForTimeout(800);

  // ── PASO 3: Describir flujo del proceso ──────────────────────────────────
  await waitNoTyping(page);
  await page.fill('#ai-scenario', FLUJO);
  await page.click('#ai-send');
  console.log('⏳ Enviando descripción del flujo...');

  // ── PASO 4: Tarjeta de inicio (flow_start) ───────────────────────────────
  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });
  console.log('✅ Tarjeta de inicio visible');

  const inicios = await page.$$eval('#start-rows .del-row', rows => rows.map(r => ({
    nombre: r.querySelector('.del-name-input')?.value,
    lane:   r.querySelector('.del-lane-sel')?.selectedOptions[0]?.textContent,
  })));
  console.log('   🏁 Inicios sugeridos:', JSON.stringify(inicios));
  await page.screenshot({ path: `${DESKTOP}/devol_02_inicio.png` });

  await page.click('#btn-start-confirm');
  console.log('✅ Inicio confirmado');
  await page.waitForTimeout(800);

  // ── PASO 5: Asistente paso a paso (flow_step xN) ─────────────────────────
  let finished = false;
  for (let i = 1; i <= MAX_STEPS; i++) {
    console.log(`⏳ Paso ${i} — esperando tarjeta...`);
    await waitNoTyping(page);
    await page.waitForSelector('#next-step-card', { timeout: TIMEOUT });

    const stepInfo = await page.evaluate(() => {
      const c = document.getElementById('next-step-card');
      return {
        tipo:   c.querySelector('#step-tipo')?.selectedOptions[0]?.textContent,
        nombre: c.querySelector('#step-nombre')?.value,
        lane:   c.querySelector('#step-lane')?.selectedOptions[0]?.textContent,
        actorVisible: c.querySelector('#step-actor-row')?.style.display !== 'none',
        actor:  c.querySelector('#step-actor')?.selectedOptions[0]?.textContent,
        esFinal: c.querySelector('#step-final')?.checked,
        btnText: c.querySelector('#btn-step-confirm')?.textContent.trim(),
      };
    });
    console.log(`   ➡️  ${stepInfo.tipo} "${stepInfo.nombre}" — ${stepInfo.lane}` +
      (stepInfo.actorVisible ? ` → 📨 ${stepInfo.actor}` : '') +
      (stepInfo.esFinal ? '  [FINAL]' : ''));

    await page.screenshot({ path: `${DESKTOP}/devol_03_paso${i}.png` });

    await page.click('#btn-step-confirm');
    console.log(`   ✅ Paso ${i} confirmado (${stepInfo.btnText})`);
    await page.waitForTimeout(800);

    if (stepInfo.esFinal) { finished = true; break; }
  }

  if (!finished) console.log('⚠️  Se alcanzó MAX_STEPS sin marcar el último paso.');

  // ── PASO 6: Esperar diagrama completo ────────────────────────────────────
  console.log('⏳ Esperando diagrama completado...');
  await page.waitForSelector('.msg-bubble.ok', { timeout: 30_000 });
  console.log('✅ Diagrama completado');

  await page.screenshot({ path: `${DESKTOP}/devol_04_completo_con_panel.png` });

  // Cerrar panel y screenshot del canvas completo con fit-to-viewport
  await page.click('#ai-close');
  await page.waitForTimeout(800);
  await page.evaluate(() => window._modeler?.get('canvas').zoom('fit-viewport'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DESKTOP}/devol_05_canvas_final.png` });
  console.log('   📸 devol_05_canvas_final.png  ← RESULTADO FINAL');

  // ── Guardar y validar XML ─────────────────────────────────────────────────
  const xml = await page.evaluate(() => window._lastGeneratedXML || null);
  if (xml) {
    writeFileSync(`${DESKTOP}/devol_ecommerce.bpmn`, xml);
    console.log(`\n   💾 XML guardado → ${DESKTOP}/devol_ecommerce.bpmn`);
    const nanCount = (xml.match(/NaN/g) || []).length;
    console.log(`   🔍 Ocurrencias de "NaN": ${nanCount}`);
    console.log(`   🔍 startEvent count: ${(xml.match(/<startEvent/g)||[]).length}`);
    console.log(`   🔍 endEvent count:   ${(xml.match(/<endEvent/g)||[]).length}`);
    console.log(`   🔍 messageEventDefinition count: ${(xml.match(/<messageEventDefinition/g)||[]).length}`);
    console.log(`   🔍 messageFlow count: ${(xml.match(/<messageFlow/g)||[]).length}`);
  }

  console.log(`\n   🔍 Errores de página/consola: ${errors.length}`);
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
