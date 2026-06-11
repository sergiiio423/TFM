/**
 * E2E:
 * 1) El análisis PERVAL solo debe clasificar lo que la empresa ENVÍA AL CLIENTE
 *    (mensajes/entregas con messageFlow hacia el participante externo "cliente"),
 *    NO las tareas puramente internas.
 * 2) Al "Pintar diagrama por valor" se debe, además del color, imprimir en el
 *    diagrama el texto de "valor" mostrado en el chat (.pv-desc) como una
 *    bpmn:TextAnnotation asociada al elemento, y "Quitar" debe eliminar tanto
 *    el color como esas anotaciones.
 */
import { chromium } from 'playwright';

const TIMEOUT = 120_000;

const DESCRIPCION = `En mi proceso participa el cliente que compra online y mi empresa, una
pequeña tienda llamada MiTienda. No tenemos departamentos.
El cliente envía un pedido (mensaje de inicio). MiTienda prepara el pedido y
envía la confirmación de envío al cliente, momento en el que el proceso termina.`;

async function waitNoTyping(page) {
  await page.waitForSelector('#ai-typing', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('ai-typing'), { timeout: TIMEOUT });
}
async function waitFreshStepCard(page) {
  await waitNoTyping(page);
  await page.waitForFunction(() => {
    const b = document.querySelector('#next-step-card #btn-step-confirm');
    return b && !b.disabled;
  }, { timeout: TIMEOUT });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setViewportSize({ width: 1700, height: 950 });
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('⚠️  PAGE ERROR:', err.message.slice(0, 200)); });

  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#ai-fab', { state: 'visible' });
  await page.click('#ai-fab');
  await page.waitForSelector('#ai-panel.open');

  await page.fill('#ai-scenario', DESCRIPCION);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#structure-card', { timeout: TIMEOUT });
  await page.click('#btn-confirm-main');
  console.log('✅ Estructura confirmada');

  await page.waitForSelector('#flow-mode-card', { timeout: TIMEOUT });
  await page.click('#btn-flow-mode-manual');

  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });
  await page.click('#btn-start-confirm');
  console.log('✅ Inicio confirmado');

  // ── Paso 1: tarea interna "Preparar pedido" (NO debe entrar en PERVAL) ──
  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'task');
  await page.fill('#next-step-card #step-nombre', 'Preparar pedido');
  if (await page.isChecked('#next-step-card #step-final')) await page.uncheck('#next-step-card #step-final');
  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Paso 1 (task interna) confirmado');

  // ── Paso 2: "Fin con mensaje" → cliente (SÍ debe entrar en PERVAL) ──────
  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'endMessageEvent');
  await page.fill('#next-step-card #step-nombre', 'Enviar confirmación de envío');
  await page.selectOption('#next-step-card #step-actor', '0'); // único actor externo: cliente
  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Paso 2 (Fin con mensaje → cliente) confirmado');

  await page.waitForSelector('.msg-bubble.ok', { timeout: 30_000 });
  console.log('✅ Diagrama completado');

  const xml0 = await page.evaluate(() => window._lastGeneratedXML || null);
  const nNaN0 = (xml0.match(/NaN/g) || []).length;
  if (nNaN0 > 0) throw new Error('El XML contiene NaN');

  // ── PERVAL ───────────────────────────────────────────────────────────────
  await page.click('#ai-perval-btn');
  await waitNoTyping(page);
  await page.waitForSelector('#perval-todos', { timeout: TIMEOUT });
  await page.click('#perval-todos');
  await waitNoTyping(page);
  await page.waitForSelector('.pv-bubble', { timeout: TIMEOUT });
  console.log('✅ Resultados PERVAL mostrados');

  const taskNames = await page.$$eval('.pv-tasks .pv-name', els => els.map(e => e.textContent.trim()));
  console.log('   Elementos clasificados por PERVAL:', JSON.stringify(taskNames));
  if (!taskNames.includes('Enviar confirmación de envío'))
    throw new Error('PERVAL no clasificó la entrega al cliente "Enviar confirmación de envío"');
  if (taskNames.includes('Preparar pedido'))
    throw new Error('PERVAL clasificó una tarea interna ("Preparar pedido") que no se envía al cliente');

  const valorTexto = await page.$eval('.pv-tasks .pv-row .pv-desc', el => el.textContent.trim());
  console.log('   Texto de valor (chat):', valorTexto.slice(0, 80) + (valorTexto.length > 80 ? '...' : ''));
  if (!valorTexto) throw new Error('La fila PERVAL no tiene texto de valor (.pv-desc)');

  // ── Pintar diagrama: color + texto de valor ─────────────────────────────
  await page.click('#pv-apply-colors');
  await page.waitForTimeout(500);

  let xmlColored = (await page.evaluate(async () => (await window._modeler.saveXML({ format: true })).xml));
  const hasFillColored = /bioc:fill="#[0-9a-fA-F]{6}"/.test(xmlColored);
  const hasAnnotation  = /<textAnnotation[ >]/.test(xmlColored);
  const hasAssociation = /<association[ >]/.test(xmlColored);
  const annotationHasText = xmlColored.includes(valorTexto.split('\n')[0].slice(0, 15));
  console.log('   XML contiene bioc:fill tras "Pintar":', hasFillColored);
  console.log('   XML contiene <textAnnotation>:', hasAnnotation);
  console.log('   XML contiene <association>:', hasAssociation);
  console.log('   La anotación contiene el texto del chat (parcial):', annotationHasText);
  if (!hasFillColored)  throw new Error('No se aplicó ningún color al diagrama');
  if (!hasAnnotation)   throw new Error('No se creó ninguna bpmn:TextAnnotation con el valor');
  if (!hasAssociation)  throw new Error('No se creó ninguna bpmn:Association hacia la anotación');
  if (!annotationHasText) throw new Error('La anotación del diagrama no contiene el texto de valor del chat');

  await page.click('#ai-close');
  await page.evaluate(() => window._modeler.get('canvas').zoom('fit-viewport'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshot_perval_client_scope.png' });
  console.log('📸 screenshot_perval_client_scope.png');
  await page.click('#ai-fab');
  await page.waitForSelector('#ai-panel.open');

  // ── Quitar: debe eliminar color Y anotaciones ───────────────────────────
  await page.click('#pv-clear-colors');
  await page.waitForTimeout(500);
  let xmlCleared = (await page.evaluate(async () => (await window._modeler.saveXML({ format: true })).xml));
  const stillColored    = /bioc:fill="#[0-9a-fA-F]{6}"/.test(xmlCleared);
  const stillAnnotation = /<textAnnotation[ >]/.test(xmlCleared);
  console.log('   XML contiene bioc:fill tras "Quitar":', stillColored);
  console.log('   XML contiene <textAnnotation> tras "Quitar":', stillAnnotation);
  if (stillColored)    throw new Error('El color no se quitó correctamente');
  if (stillAnnotation) throw new Error('La anotación de texto no se quitó correctamente');

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  if (errors.length > 0) throw new Error('Hubo errores de consola');
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
