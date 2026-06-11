/**
 * E2E:
 * 1) Verifica el nuevo tipo de paso "Fin con mensaje" (endMessageEvent):
 *    - Oculta el checkbox de "último paso" (es implícito).
 *    - Permite elegir destinatario externo (cliente).
 *    - Genera UN único <endEvent> con <messageEventDefinition> y su messageFlow
 *      hacia el participante externo (no una tarea + Fin separados).
 * 2) Verifica que el análisis PERVAL ofrece pintar el diagrama con los colores
 *    de cada dimensión (y quitar el color), usando modeling.setColor.
 */
import { chromium } from 'playwright';

const TIMEOUT = 120_000;

const PARTICIPANTES = `En mi proceso participa el cliente que compra online y mi empresa, una
pequeña tienda llamada MiTienda. No tenemos departamentos.`;

const FLUJO = `El cliente envía un pedido (mensaje de inicio). MiTienda prepara el pedido y
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

  await page.fill('#ai-scenario', PARTICIPANTES);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#structure-card', { timeout: TIMEOUT });
  await page.click('#btn-confirm-main');
  console.log('✅ Estructura confirmada');

  await waitNoTyping(page);
  await page.fill('#ai-scenario', FLUJO);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });
  await page.click('#btn-start-confirm');
  console.log('✅ Inicio confirmado');

  // ── Paso 1: tarea normal "Preparar pedido" ──────────────────────────────
  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'task');
  await page.fill('#next-step-card #step-nombre', 'Preparar pedido');
  if (await page.isChecked('#next-step-card #step-final')) await page.uncheck('#next-step-card #step-final');
  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Paso 1 (task) confirmado');

  // ── Paso 2: "Fin con mensaje" → cliente ─────────────────────────────────
  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'endMessageEvent');
  await page.fill('#next-step-card #step-nombre', 'Enviar confirmación de envío');

  const finalRowVisible = await page.$eval('#next-step-card #step-final-row', el => el.style.display !== 'none');
  console.log('   Checkbox "último paso" visible con endMessageEvent:', finalRowVisible);
  if (finalRowVisible) throw new Error('El checkbox de último paso no debería verse para "Fin con mensaje"');

  const actorRowVisible = await page.$eval('#next-step-card #step-actor-row', el => el.style.display !== 'none');
  console.log('   Selector de destinatario visible:', actorRowVisible);
  if (!actorRowVisible) throw new Error('El selector de destinatario debería verse para "Fin con mensaje"');

  const actorOptions = await page.$$eval('#next-step-card #step-actor option', els => els.map(e => e.textContent.trim()));
  console.log('   Destinatarios disponibles:', actorOptions.join(', '));
  await page.selectOption('#next-step-card #step-actor', '0'); // único actor externo: cliente

  const btnTxt = await page.$eval('#next-step-card #btn-step-confirm', el => el.textContent.trim());
  console.log('   Texto botón:', btnTxt);
  if (!btnTxt.includes('mensaje final')) throw new Error('El botón no indica "mensaje final" para endMessageEvent');

  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Paso 2 (Fin con mensaje) confirmado');

  await page.waitForSelector('.msg-bubble.ok', { timeout: 30_000 });
  console.log('✅ Diagrama completado');

  // ── Verificación del XML ─────────────────────────────────────────────────
  let xml = await page.evaluate(() => window._lastGeneratedXML || null);
  const nEnds   = (xml.match(/<endEvent /g) || []).length;
  const nMsgEnd = (xml.match(/<endEvent[^>]*>\s*<messageEventDefinition/g) || []).length;
  const nTasks  = (xml.match(/<(send)?[Tt]ask /g) || []).length;
  const hasMF   = /<messageFlow id="MF_END_0"/.test(xml);
  const nNaN    = (xml.match(/NaN/g) || []).length;
  console.log('   endEvent total:', nEnds, '| con messageEventDefinition:', nMsgEnd);
  console.log('   tasks/sendTasks:', nTasks);
  console.log('   messageFlow MF_END_0 (fin → cliente):', hasMF);
  console.log('   Ocurrencias de "NaN":', nNaN);

  if (nEnds !== 1)    throw new Error(`Se esperaba 1 endEvent, hay ${nEnds}`);
  if (nMsgEnd !== 1)  throw new Error('El endEvent no tiene messageEventDefinition');
  if (nTasks !== 1)   throw new Error(`Se esperaba 1 task (no debería añadirse una sendTask extra), hay ${nTasks}`);
  if (!hasMF)         throw new Error('Falta el messageFlow del fin con mensaje hacia el cliente');
  if (nNaN > 0)       throw new Error('El XML contiene NaN');

  // ── PERVAL: pintar el diagrama ───────────────────────────────────────────
  await page.click('#ai-perval-btn');
  await waitNoTyping(page);
  // Hay actor externo (cliente) → aparece selector de actor
  await page.waitForSelector('#perval-todos', { timeout: TIMEOUT });
  await page.click('#perval-todos');
  await waitNoTyping(page);
  await page.waitForSelector('.pv-bubble', { timeout: TIMEOUT });
  console.log('✅ Resultados PERVAL mostrados');

  const hasApplyBtn = await page.$('#pv-apply-colors') !== null;
  console.log('   Botón "Pintar diagrama por valor" presente:', hasApplyBtn);
  if (!hasApplyBtn) throw new Error('Falta el botón para pintar el diagrama con los colores PERVAL');

  await page.click('#pv-apply-colors');
  await page.waitForTimeout(500);

  let xmlColored = (await page.evaluate(async () => (await window._modeler.saveXML({ format: true })).xml));
  const hasFillColored = /bioc:fill="#[0-9a-fA-F]{6}"/.test(xmlColored);
  console.log('   XML contiene bioc:fill tras "Pintar":', hasFillColored);
  if (!hasFillColored) throw new Error('No se aplicó ningún color al diagrama');

  await page.click('#ai-close');
  await page.evaluate(() => window._modeler.get('canvas').zoom('fit-viewport'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshot_endmsg_perval.png' });
  console.log('📸 screenshot_endmsg_perval.png');
  await page.click('#ai-fab');
  await page.waitForSelector('#ai-panel.open');

  await page.click('#pv-clear-colors');
  await page.waitForTimeout(500);
  let xmlCleared = (await page.evaluate(async () => (await window._modeler.saveXML({ format: true })).xml));
  const stillColored = /bioc:fill="#[0-9a-fA-F]{6}"/.test(xmlCleared);
  console.log('   XML contiene bioc:fill tras "Quitar":', stillColored);
  if (stillColored) throw new Error('El color no se quitó correctamente');

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  if (errors.length > 0) throw new Error('Hubo errores de consola');
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
