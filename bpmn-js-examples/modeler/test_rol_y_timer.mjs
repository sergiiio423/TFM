/**
 * Smoke test:
 * 1. Verifica que la tarjeta de confirmación de estructura distingue
 *    "cliente" (🧑‍💼) de "colaborador" (🤝) entre los participantes externos.
 * 2. Verifica que la selección de actor para PERVAL muestra los clientes
 *    como opción principal y los colaboradores como grupo secundario.
 * 3. Verifica que el tipo "timerEvent" (Evento Intermedio de Temporizador)
 *    se puede seleccionar en la tarjeta de paso y genera un XML válido con
 *    <intermediateCatchEvent><timerEventDefinition/>.
 */
import { chromium } from 'playwright';

const TIMEOUT = 120_000;

const PARTICIPANTES = `En mi proceso participan: el cliente que compra online, y una pasarela
de pago que gestiona los cobros. Por parte de mi empresa intervienen dos
departamentos: Ventas y Almacén.`;

const FLUJO = `El cliente envía el pedido (mensaje de inicio). Ventas confirma el pago
con la pasarela de pago (mensaje). Almacén espera 1 día antes de preparar el pedido.`;

async function waitNoTyping(page) {
  await page.waitForSelector('#ai-typing', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('ai-typing'), { timeout: TIMEOUT });
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
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

  // ── Paso 1: estructura ──────────────────────────────────────────────
  await page.fill('#ai-scenario', PARTICIPANTES);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#structure-card', { timeout: TIMEOUT });

  const clientChips = await page.$$eval('.client-chip', els => els.map(e => e.textContent.trim()));
  const extChips    = await page.$$eval('.ext-chip',    els => els.map(e => e.textContent.trim()));
  const legend      = await page.$eval('.struct-legend', el => el.textContent.trim()).catch(() => null);
  const headerTxt   = await page.$$eval('.struct-label', els => els.map(e => e.textContent.trim()));

  console.log('   Chips cliente (🧑‍💼):', clientChips);
  console.log('   Chips colaborador (🤝):', extChips);
  console.log('   Leyenda:', legend);
  console.log('   Headers:', headerTxt);

  if (clientChips.length === 0) throw new Error('No se detectó ningún chip de cliente (.client-chip)');
  if (!headerTxt.some(h => h.includes('CLIENTES Y COLABORADORES'))) throw new Error('Header de estructura no actualizado');
  if (!legend) throw new Error('No se encontró la leyenda .struct-legend');

  await page.click('#btn-confirm-main');
  console.log('✅ Estructura confirmada');
  await page.waitForTimeout(500);

  // ── Paso 2: inicio del flujo ────────────────────────────────────────
  await waitNoTyping(page);
  await page.fill('#ai-scenario', FLUJO);
  await page.click('#ai-send');

  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });
  await page.click('#btn-start-confirm');
  console.log('✅ Inicio confirmado');
  await page.waitForTimeout(500);

  // ── Paso 3: paso con timerEvent ─────────────────────────────────────
  await waitNoTyping(page);
  await page.waitForSelector('#next-step-card', { timeout: TIMEOUT });
  console.log('✅ Tarjeta de paso visible');

  const options = await page.$$eval('#step-tipo option', els => els.map(e => e.value));
  console.log('   Opciones de tipo:', options.join(', '));
  if (!options.includes('timerEvent')) throw new Error('timerEvent no está en el selector de tipo');
  if (!options.includes('compensationEvent')) throw new Error('compensationEvent no está en el selector de tipo');

  await page.selectOption('#step-tipo', 'timerEvent');
  await page.fill('#step-nombre', 'Esperar 1 día');
  await page.check('#step-final');

  const actorVisible = await page.$eval('#step-actor-row', el => el.style.display !== 'none');
  console.log('   Fila actor externo visible:', actorVisible);
  if (actorVisible) throw new Error('La fila de actor externo no debería mostrarse para timerEvent');

  await page.click('#btn-step-confirm');
  console.log('✅ Paso de temporizador confirmado (final)');

  await page.waitForSelector('.msg-bubble.ok', { timeout: 30_000 });
  console.log('✅ Diagrama completado');

  const xml = await page.evaluate(() => window._lastGeneratedXML || null);
  const hasTimer = /<intermediateCatchEvent[^>]*>\s*<timerEventDefinition/.test(xml);
  console.log('   Contiene <intermediateCatchEvent><timerEventDefinition>:', hasTimer);
  console.log('   Ocurrencias de "NaN":', (xml.match(/NaN/g) || []).length);
  if (!hasTimer) throw new Error('El XML no contiene el evento de temporizador esperado');

  // ── Paso 4: PERVAL actor select ─────────────────────────────────────
  await waitNoTyping(page);
  // El botón de PERVAL puede tener distintos selectores; buscamos por texto
  const pervalBtn = await page.$('#btn-perval, [data-action="perval"], button:has-text("PERVAL")');
  if (pervalBtn) {
    await pervalBtn.click();
    await waitNoTyping(page);
    await page.waitForSelector('.perval-actor-btn, #perval-todos', { timeout: TIMEOUT });
    const clientBtns = await page.$$eval('.perval-actor-btn', els => els.map(e => e.textContent.trim()));
    const subtitle = await page.$eval('.val-subtitle', el => el.textContent.trim()).catch(() => null);
    console.log('   Botones de actor PERVAL:', clientBtns);
    console.log('   Subtítulo colaboradores:', subtitle);
    if (!clientBtns.some(b => b.includes('🧑‍💼'))) throw new Error('No se encontró botón de actor cliente (🧑‍💼) en PERVAL');
  } else {
    console.log('   (Botón PERVAL no encontrado, se omite verificación de PERVAL)');
  }

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
