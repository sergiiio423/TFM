/**
 * E2E: verifica que un exclusiveGateway permite definir N casos/ramas, cada una
 * con sus propios pasos, con convergencia (join) y/o fin de proceso por rama.
 */
import { chromium } from 'playwright';

const TIMEOUT = 120_000;

const PARTICIPANTES = `En mi proceso participa: el cliente que compra online. Por parte de mi
empresa, una tienda online, intervienen dos departamentos: Ventas y Almacén.`;

const FLUJO = `El cliente envía un pedido (mensaje de inicio). Ventas comprueba el stock del
producto. Si hay stock, Almacén prepara el pedido. Si no hay stock, Ventas envía un email al
cliente avisando de que no está disponible y el proceso termina. Si el stock es parcial,
Ventas avisa al cliente de un retraso. Cuando hay stock total o parcial, Ventas confirma
el envío al cliente y el proceso termina.`;

async function waitNoTyping(page) {
  await page.waitForSelector('#ai-typing', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('ai-typing'), { timeout: TIMEOUT });
}

// Espera a que haya una tarjeta de paso "fresca" (botón habilitado)
async function waitFreshStepCard(page) {
  await waitNoTyping(page);
  await page.waitForFunction(() => {
    const b = document.querySelector('#next-step-card #btn-step-confirm');
    return b && !b.disabled;
  }, { timeout: TIMEOUT });
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const page    = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  page.setDefaultTimeout(20_000);

  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('⚠️  PAGE ERROR:', err.message.slice(0, 200)); });

  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#ai-fab', { state: 'visible' });
  await page.click('#ai-fab');
  await page.waitForSelector('#ai-panel.open');
  console.log('✅ App lista');

  // ── Estructura + inicio ─────────────────────────────────────────────
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

  // ── Paso 1: tarea normal "Comprobar stock" ──────────────────────────
  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'task');
  await page.fill('#next-step-card #step-nombre', 'Comprobar stock');
  if (await page.isChecked('#next-step-card #step-final')) await page.uncheck('#next-step-card #step-final');
  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Paso 1 (task) confirmado');

  // ── Paso 2: exclusiveGateway ────────────────────────────────────────
  await waitFreshStepCard(page);
  await page.selectOption('#next-step-card #step-tipo', 'exclusiveGateway');
  await page.fill('#next-step-card #step-nombre', '¿Hay stock?');

  // El checkbox "último paso" debe ocultarse para gateways
  const finalRowVisible = await page.$eval('#next-step-card #step-final-row', el => el.style.display !== 'none');
  console.log('   Checkbox "último paso" visible con gateway:', finalRowVisible);
  if (finalRowVisible) throw new Error('El checkbox de último paso no debería verse para un gateway');

  const btnTxt = await page.$eval('#next-step-card #btn-step-confirm', el => el.textContent.trim());
  console.log('   Texto botón:', btnTxt);
  if (!btnTxt.includes('definir casos')) throw new Error('El botón no indica "definir casos" para un gateway');

  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Gateway confirmado');

  // ── Tarjeta de casos: dejar exactamente 3 ───────────────────────────
  await waitNoTyping(page);
  await page.waitForSelector('#branches-card', { timeout: TIMEOUT });
  console.log('✅ Tarjeta de casos visible');

  let nRows = (await page.$$('#branches-card #branch-rows input')).length;
  console.log('   Casos sugeridos por la IA:', nRows);
  while (nRows > 3) {
    const removes = await page.$$('#branches-card #branch-rows .del-row-remove');
    await removes[removes.length - 1].click();
    nRows = (await page.$$('#branches-card #branch-rows input')).length;
  }
  while (nRows < 3) {
    await page.click('#branches-card #branch-add-btn');
    nRows = (await page.$$('#branches-card #branch-rows input')).length;
  }
  const CASOS = ['Hay stock', 'Sin stock', 'Stock parcial'];
  for (let i = 0; i < 3; i++) {
    const inputs = await page.$$('#branches-card #branch-rows input');
    await inputs[i].fill(CASOS[i]);
  }
  await page.click('#branches-card #btn-branches-confirm');
  console.log('✅ 3 casos confirmados:', CASOS.join(' / '));

  // ── Rama 1: "Hay stock" → converge ──────────────────────────────────
  await waitFreshStepCard(page);
  let header = await page.$eval('#next-step-card .val-header', el => el.textContent);
  console.log('   Header rama 1:', header.trim());
  if (!header.includes('Hay stock')) throw new Error('La tarjeta no muestra el caso "Hay stock"');

  // El selector de tipo NO debe incluir gateways dentro de una rama
  const tiposRama = await page.$$eval('#next-step-card #step-tipo option', els => els.map(e => e.value));
  console.log('   Tipos en rama:', tiposRama.join(', '));
  if (tiposRama.includes('exclusiveGateway') || tiposRama.includes('parallelGateway'))
    throw new Error('No deberían ofrecerse gateways dentro de una rama');

  await page.selectOption('#next-step-card #step-tipo', 'task');
  await page.fill('#next-step-card #step-nombre', 'Preparar pedido');
  await page.check('#next-step-card #step-final');
  if (await page.isChecked('#next-step-card #step-end-process')) await page.uncheck('#next-step-card #step-end-process');
  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Rama 1 cerrada (converge)');

  // ── Rama 2: "Sin stock" → sendTask al cliente, termina el proceso ───
  await waitFreshStepCard(page);
  header = await page.$eval('#next-step-card .val-header', el => el.textContent);
  console.log('   Header rama 2:', header.trim());
  if (!header.includes('Sin stock')) throw new Error('La tarjeta no muestra el caso "Sin stock"');

  await page.selectOption('#next-step-card #step-tipo', 'sendTask');
  await page.fill('#next-step-card #step-nombre', 'Enviar email sin stock');
  await page.check('#next-step-card #step-final');
  await page.check('#next-step-card #step-end-process');
  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Rama 2 cerrada (termina el proceso)');

  // ── Rama 3: "Stock parcial" → converge ──────────────────────────────
  await waitFreshStepCard(page);
  header = await page.$eval('#next-step-card .val-header', el => el.textContent);
  console.log('   Header rama 3:', header.trim());
  if (!header.includes('Stock parcial')) throw new Error('La tarjeta no muestra el caso "Stock parcial"');

  await page.selectOption('#next-step-card #step-tipo', 'task');
  await page.fill('#next-step-card #step-nombre', 'Avisar retraso');
  await page.check('#next-step-card #step-final');
  if (await page.isChecked('#next-step-card #step-end-process')) await page.uncheck('#next-step-card #step-end-process');
  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Rama 3 cerrada (converge)');

  // ── Tras el join: paso normal final ─────────────────────────────────
  await waitFreshStepCard(page);
  header = await page.$eval('#next-step-card .val-header', el => el.textContent);
  console.log('   Header tras el join:', header.trim());
  if (header.includes('Caso')) throw new Error('Tras cerrar todas las ramas debería volver al asistente principal');

  await page.selectOption('#next-step-card #step-tipo', 'sendTask');
  await page.fill('#next-step-card #step-nombre', 'Confirmar envío');
  await page.check('#next-step-card #step-final');
  await page.click('#next-step-card #btn-step-confirm');
  console.log('✅ Paso final confirmado');

  await page.waitForSelector('.msg-bubble.ok', { timeout: 30_000 });
  console.log('✅ Diagrama completado');

  // ── Verificación del XML ────────────────────────────────────────────
  const xml = await page.evaluate(() => window._lastGeneratedXML || null);
  const nGW    = (xml.match(/<exclusiveGateway /g) || []).length;
  const nEnds  = (xml.match(/<endEvent /g) || []).length;
  const namedFlows = CASOS.filter(c => new RegExp(`<sequenceFlow [^>]*name="${c}"`).test(xml));
  const nNaN   = (xml.match(/NaN/g) || []).length;
  console.log('   exclusiveGateway (split+join):', nGW);
  console.log('   endEvent:', nEnds);
  console.log('   Flujos nombrados con los casos:', namedFlows.join(' / '));
  console.log('   Ocurrencias de "NaN":', nNaN);

  if (nGW !== 2)   throw new Error(`Se esperaban 2 exclusiveGateway (split+join), hay ${nGW}`);
  if (nEnds !== 2) throw new Error(`Se esperaban 2 endEvent (fin del proceso + fin de "Sin stock"), hay ${nEnds}`);
  if (namedFlows.length !== 3) throw new Error('No todos los flujos salientes del gateway llevan el nombre del caso');
  if (nNaN > 0)    throw new Error('El XML contiene NaN');

  await page.click('#ai-close');
  await page.evaluate(() => window._modeler.get('canvas').zoom('fit-viewport'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshot_branches.png' });
  console.log('📸 screenshot_branches.png');

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  if (errors.length > 0) throw new Error('Hubo errores de consola');
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
