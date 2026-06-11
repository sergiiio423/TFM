/**
 * E2E: flujo combinado (una sola descripción inicial) + "Añadir información"
 * en cualquier momento durante el asistente paso a paso.
 * 1) Una única descripción (participantes + flujo) basta para identificar la
 *    estructura y arrancar directamente el asistente paso a paso (sin pedir
 *    una segunda descripción del flujo).
 * 2) Durante una fase de flujo (flow_start / flow_step), el textarea está
 *    habilitado, se muestra el botón "➕ Añadir información" y al usarlo:
 *    - aparece el texto como mensaje de usuario,
 *    - aparece el mensaje de confirmación de la IA,
 *    - el textarea queda vacío.
 * 3) 0 errores de consola.
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

  // ── 1) Una sola descripción → estructura → flujo paso a paso directamente ──
  await page.fill('#ai-scenario', DESCRIPCION);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#structure-card', { timeout: TIMEOUT });
  console.log('✅ Estructura identificada a partir de una sola descripción');

  await page.click('#btn-confirm-main');
  await page.waitForSelector('#flow-mode-card', { timeout: TIMEOUT });
  await page.click('#btn-flow-mode-manual');
  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });
  console.log('✅ Tras confirmar estructura, pasa directamente a definir el inicio (sin segunda descripción)');

  // ── 2) "Añadir información" durante flow_start ──────────────────────────
  const addBtnVisible = await page.isVisible('#ai-add-info-btn');
  if (!addBtnVisible) throw new Error('El botón "Añadir información" no está visible en flow_start');
  const textareaDisabled = await page.$eval('#ai-scenario', el => el.disabled);
  if (textareaDisabled) throw new Error('El textarea debería estar habilitado en flow_start para añadir información');

  const EXTRA = 'Se me olvidó decir que MiTienda también tiene un almacén propio.';
  await page.fill('#ai-scenario', EXTRA);
  await page.click('#ai-add-info-btn');

  await page.waitForFunction(
    text => document.querySelector('#ai-messages')?.textContent.includes(text),
    EXTRA,
    { timeout: 10_000 }
  );
  const taValue = await page.$eval('#ai-scenario', el => el.value);
  if (taValue !== '') throw new Error('El textarea no se vació tras añadir información');

  const lastBubble = await page.$$eval('#ai-messages .msg.ai .msg-bubble', els => els[els.length - 1].textContent);
  if (!/Información añadida/i.test(lastBubble)) throw new Error('No se mostró el mensaje de confirmación de información añadida: ' + lastBubble);
  console.log('✅ "Añadir información" funciona durante el flujo paso a paso');

  await page.click('#btn-start-confirm');
  await waitNoTyping(page);
  console.log('✅ Inicio confirmado tras añadir información extra');

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  if (errors.length > 0) throw new Error('Hubo errores de consola');
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
