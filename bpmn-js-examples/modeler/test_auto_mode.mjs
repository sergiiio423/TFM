/**
 * E2E: modo "Generar todo de una vez" (autoGenerateAll).
 * 1) Tras confirmar la estructura aparece la tarjeta de elección de modo
 *    (#flow-mode-card) con los botones paso a paso / automático.
 * 2) Al elegir el modo automático, el asistente recorre por sí solo
 *    flow_start → flow_step* → (flow_branches → flow_branch_step*)? → refine
 *    sin que el test interactúe con ninguna tarjeta de confirmación,
 *    y termina SIEMPRE el diagrama (llega a fase refine / aparece el botón
 *    PERVAL), sin entrar en bucle infinito (hay un timeout global).
 * 3) El XML generado no contiene NaN y tiene al menos un evento de inicio
 *    y uno de fin.
 * 4) 0 errores de consola.
 */
import { chromium } from 'playwright';

const TIMEOUT = 180_000;

const DESCRIPCION = `En mi proceso participa el cliente que compra online y mi empresa, una
pequeña tienda llamada MiTienda. No tenemos departamentos.
El cliente envía un pedido (mensaje de inicio). MiTienda revisa el stock: si hay stock,
prepara el pedido y lo envía al cliente con un mensaje de confirmación, momento en el
que el proceso termina; si no hay stock, MiTienda avisa al cliente de que el pedido se
retrasará y, una vez repuesto el stock, prepara el pedido y lo envía igualmente.`;

async function waitNoTyping(page) {
  await page.waitForSelector('#ai-typing', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('ai-typing'), { timeout: TIMEOUT });
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
  console.log('✅ Estructura identificada');

  await page.click('#btn-confirm-main');
  await page.waitForSelector('#flow-mode-card', { timeout: TIMEOUT });
  console.log('✅ Tarjeta de elección de modo visible');

  // ── Elegir modo automático ───────────────────────────────────────────────
  await page.click('#btn-flow-mode-auto');
  console.log('✅ Modo automático seleccionado');

  // El punto de inicio SIEMPRE se pregunta, incluso en modo automático.
  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });
  console.log('✅ Tarjeta de inicio visible (se sigue preguntando incluso en modo automático)');
  await page.click('#btn-start-confirm');

  // A partir de aquí, el asistente debe ir generando pasos solo, sin mostrar
  // ninguna tarjeta de confirmación (#next-step-card / #branches-card), hasta
  // llegar a la fase "refine" (botón PERVAL visible) o mostrar el mensaje de
  // diagrama completo.
  await page.waitForFunction(() => {
    const btn = document.getElementById('ai-perval-btn');
    return btn && getComputedStyle(btn).display !== 'none';
  }, { timeout: TIMEOUT });
  console.log('✅ El asistente terminó el diagrama automáticamente (botón PERVAL visible)');

  // No debe haber quedado ninguna tarjeta de confirmación pendiente/activa.
  for (const sel of ['#start-card', '#next-step-card', '#branches-card']) {
    const card = await page.$(sel);
    if (card) {
      const disabled = await card.evaluate(el => el.classList.contains('disabled') || el.querySelectorAll('button:not([disabled])').length === 0);
      if (!disabled) throw new Error(`Quedó una tarjeta "${sel}" activa sin confirmar en modo automático`);
    }
  }
  console.log('✅ No quedaron tarjetas de confirmación pendientes');

  // ── Verificar el XML generado ────────────────────────────────────────────
  const xml = await page.evaluate(() => window._lastGeneratedXML || '');
  if (!xml) throw new Error('No se generó XML del diagrama');
  if (/NaN/.test(xml)) throw new Error('El XML generado contiene NaN');
  const startEvents = (xml.match(/<startEvent/g) || []).length;
  const endEvents   = (xml.match(/<endEvent/g) || []).length;
  if (startEvents < 1) throw new Error('El XML no contiene ningún startEvent');
  if (endEvents < 1) throw new Error('El XML no contiene ningún endEvent');
  console.log(`✅ XML válido: ${startEvents} startEvent(s), ${endEvents} endEvent(s), 0 NaN`);

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  if (errors.length > 0) throw new Error('Hubo errores de consola');
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
