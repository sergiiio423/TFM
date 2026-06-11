/**
 * Verifica el caso "piscina única": si la descripción no menciona
 * departamentos, no se inventan lanes; el pool principal se dibuja sin calles
 * y el asistente funciona igualmente (laneIdx 0 = organización).
 */
import { chromium } from 'playwright';

const TIMEOUT = 120_000;

const PARTICIPANTES = `En mi proceso participa el cliente que compra online y mi empresa, una
pequeña tienda llamada MiTienda. No tenemos departamentos.`;

const FLUJO = `El cliente envía un pedido (mensaje de inicio). MiTienda valida el pedido y
lo prepara. Después envía la confirmación al cliente y el proceso termina.`;

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

  const chips = await page.$$eval('#structure-card .struct-chip', els => els.map(e => e.textContent.trim()));
  console.log('   Chips de estructura:', JSON.stringify(chips));
  const hasPiscinaUnica = chips.some(c => c.includes('Piscina única'));
  console.log('   Muestra "Piscina única":', hasPiscinaUnica);
  if (!hasPiscinaUnica) throw new Error('Con la descripción sin departamentos debería ofrecer piscina única (la IA pudo inventar lanes)');

  await page.click('#btn-confirm-main');
  console.log('✅ Estructura confirmada (sin lanes)');

  await waitNoTyping(page);
  await page.fill('#ai-scenario', FLUJO);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });

  // El select de lane debe tener una única opción: el nombre de la organización
  const laneOpts = await page.$$eval('#start-card .del-lane-sel', sels => sels[0] ? Array.from(sels[0].options).map(o => o.textContent) : []);
  console.log('   Opciones de "lane" en inicio:', JSON.stringify(laneOpts));

  await page.click('#btn-start-confirm');
  console.log('✅ Inicio confirmado');

  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'task');
  await page.fill('#next-step-card #step-nombre', 'Validar y preparar pedido');
  if (await page.isChecked('#next-step-card #step-final')) await page.uncheck('#next-step-card #step-final');
  await page.click('#next-step-card #btn-step-confirm');

  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'sendTask');
  await page.fill('#next-step-card #step-nombre', 'Enviar confirmación');
  await page.check('#next-step-card #step-final');
  await page.click('#next-step-card #btn-step-confirm');

  await page.waitForSelector('.msg-bubble.ok', { timeout: 30_000 });
  console.log('✅ Diagrama completado');

  await page.click('#ai-close');
  await page.evaluate(() => window._modeler.get('canvas').zoom('fit-viewport'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshot_sin_lanes.png' });
  console.log('📸 screenshot_sin_lanes.png');

  const xml = await page.evaluate(() => window._lastGeneratedXML || null);
  const hasLaneSet = xml.includes('<laneSet');
  const nNaN = (xml.match(/NaN/g) || []).length;
  console.log('   XML contiene <laneSet>:', hasLaneSet);
  console.log('   Ocurrencias de "NaN":', nNaN);
  if (hasLaneSet) throw new Error('El XML no debería tener laneSet en el caso de piscina única');
  if (nNaN > 0)   throw new Error('El XML contiene NaN');

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  if (errors.length > 0) throw new Error('Hubo errores de consola');
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => { console.error('❌ ERROR:', err.message); process.exit(1); });
