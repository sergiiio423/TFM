/**
 * Reproducción visual: inicio con mensaje + 2 tareas en lanes distintos.
 * Guarda captura y vuelca los sequenceFlow del XML para diagnosticar
 * conexiones que faltan.
 */
import { chromium } from 'playwright';

const TIMEOUT = 120_000;

const PARTICIPANTES = `En mi proceso participa el cliente que compra online. Por parte de mi
empresa intervienen dos departamentos: Ventas y Almacén.`;

const FLUJO = `El cliente envía un pedido (mensaje de inicio). Ventas valida el pedido.
Almacén prepara el pedido y termina el proceso.`;

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
  page.on('pageerror', err => console.log('⚠️  PAGE ERROR:', err.message.slice(0, 200)));

  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#ai-fab', { state: 'visible' });
  await page.click('#ai-fab');
  await page.waitForSelector('#ai-panel.open');

  await page.fill('#ai-scenario', PARTICIPANTES);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#structure-card', { timeout: TIMEOUT });
  await page.click('#btn-confirm-main');

  await waitNoTyping(page);
  await page.fill('#ai-scenario', FLUJO);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });
  await page.click('#btn-start-confirm');
  console.log('✅ Inicio confirmado');

  // Paso 1: tarea en Ventas
  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'task');
  await page.fill('#next-step-card #step-nombre', 'Validar pedido');
  await page.selectOption('#next-step-card #step-lane', '0');
  if (await page.isChecked('#next-step-card #step-final')) await page.uncheck('#next-step-card #step-final');
  await page.click('#next-step-card #btn-step-confirm');

  // Paso 2: evento de mensaje (espera) en Ventas
  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'intermediateCatchEvent');
  await page.fill('#next-step-card #step-nombre', 'Confirmación recibida');
  await page.selectOption('#next-step-card #step-lane', '0');
  if (await page.isChecked('#next-step-card #step-final')) await page.uncheck('#next-step-card #step-final');
  await page.click('#next-step-card #btn-step-confirm');

  // Paso 3: tarea final en Almacén
  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'task');
  await page.fill('#next-step-card #step-nombre', 'Preparar pedido');
  await page.selectOption('#next-step-card #step-lane', '1');
  await page.check('#next-step-card #step-final');
  await page.click('#next-step-card #btn-step-confirm');

  await page.waitForSelector('.msg-bubble.ok', { timeout: 30_000 });
  console.log('✅ Diagrama completado');

  // Cerrar panel, encuadrar y captura
  await page.click('#ai-close');
  await page.evaluate(() => window._modeler.get('canvas').zoom('fit-viewport'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshot_conexiones.png', fullPage: false });
  console.log('📸 screenshot_conexiones.png');

  const xml = await page.evaluate(() => window._lastGeneratedXML || null);
  const flows = xml.match(/<sequenceFlow [^/]*\/>/g) || [];
  console.log('\nsequenceFlows en XML:');
  flows.forEach(f => console.log('  ', f.trim()));
  const edges = xml.match(/bpmnElement="SF_\d+"/g) || [];
  console.log('Edges DI de sequenceFlow:', edges.length);

  await browser.close();
})().catch(err => { console.error('❌ ERROR:', err.message); process.exit(1); });
