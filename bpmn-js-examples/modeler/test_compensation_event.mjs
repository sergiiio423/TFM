/**
 * Smoke test: verifica que el tipo "compensationEvent" (Evento Intermedio de
 * Compensación) se puede seleccionar en la tarjeta de paso y genera un XML
 * válido con <intermediateThrowEvent><compensateEventDefinition/>.
 */
import { chromium } from 'playwright';

const TIMEOUT = 120_000;

const PARTICIPANTES = `En mi proceso participan: el cliente que compra online, una pasarela
de pago que gestiona cobros y reembolsos, y una empresa de transporte
que recoge los paquetes devueltos. Por parte de mi empresa intervienen
dos departamentos: Atención al Cliente y Almacén.`;

const FLUJO = `El cliente solicita la devolución de un pedido (mensaje de inicio).
Atención al Cliente revisa la solicitud.`;

async function waitNoTyping(page) {
  await page.waitForSelector('#ai-typing', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('ai-typing'), { timeout: TIMEOUT });
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
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

  await page.fill('#ai-scenario', PARTICIPANTES);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#structure-card', { timeout: TIMEOUT });
  await page.click('#btn-confirm-main');
  console.log('✅ Estructura confirmada');
  await page.waitForTimeout(500);

  await waitNoTyping(page);
  await page.fill('#ai-scenario', FLUJO);
  await page.click('#ai-send');

  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });
  await page.click('#btn-start-confirm');
  console.log('✅ Inicio confirmado');
  await page.waitForTimeout(500);

  await waitNoTyping(page);
  await page.waitForSelector('#next-step-card', { timeout: TIMEOUT });
  console.log('✅ Tarjeta de paso visible');

  // Comprobar que la opción existe en el select
  const options = await page.$$eval('#step-tipo option', els => els.map(e => e.value));
  console.log('   Opciones de tipo:', options.join(', '));
  if (!options.includes('compensationEvent')) throw new Error('compensationEvent no está en el selector de tipo');

  // Forzar tipo = compensationEvent, nombre, y marcar como último paso
  await page.selectOption('#step-tipo', 'compensationEvent');
  await page.fill('#step-nombre', 'Anular cargo en tarjeta');
  await page.check('#step-final');

  // La fila de actor externo no debería verse para compensationEvent
  const actorVisible = await page.$eval('#step-actor-row', el => el.style.display !== 'none');
  console.log('   Fila actor externo visible:', actorVisible);
  if (actorVisible) throw new Error('La fila de actor externo no debería mostrarse para compensationEvent');

  await page.click('#btn-step-confirm');
  console.log('✅ Paso de compensación confirmado (final)');

  await page.waitForSelector('.msg-bubble.ok', { timeout: 30_000 });
  console.log('✅ Diagrama completado');

  const xml = await page.evaluate(() => window._lastGeneratedXML || null);
  const hasThrow = /<intermediateThrowEvent[^>]*>\s*<compensateEventDefinition/.test(xml);
  console.log('   Contiene <intermediateThrowEvent><compensateEventDefinition>:', hasThrow);
  console.log('   Ocurrencias de "NaN":', (xml.match(/NaN/g) || []).length);
  if (!hasThrow) throw new Error('El XML no contiene el evento de compensación esperado');

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
