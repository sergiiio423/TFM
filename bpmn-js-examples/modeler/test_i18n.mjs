/**
 * E2E: soporte bilingüe ES/EN del asistente BPMN AI.
 * 1) Por defecto la interfaz está en español.
 * 2) Al cambiar a EN con el selector de idioma, todo el chrome estático
 *    (subtítulo, barra de fases, botones, hints, mensaje de bienvenida,
 *    título del FAB/reset/mic) cambia a inglés, document.lang='en' y
 *    el botón EN queda marcado como activo. La preferencia persiste
 *    (localStorage) tras recargar la página.
 * 3) Con el idioma en inglés, las respuestas generadas por la IA
 *    (mensajes de estado del flujo) también se muestran en inglés.
 * 4) Volver a ES restaura los textos en español.
 * 5) 0 errores de consola.
 */
import { chromium } from 'playwright';

const TIMEOUT = 120_000;

const DESCRIPTION = `My process involves a customer who buys online and my company, a small
shop called MyShop. We have no departments.
The customer sends an order (start message). MyShop prepares the order and
sends the shipping confirmation to the customer, at which point the process ends.`;

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

  // ── 1) Por defecto: español ─────────────────────────────────────────────
  const subtitleEs = await page.textContent('.ai-subtitle');
  if (!subtitleEs.includes('Generación')) throw new Error(`Subtítulo ES inesperado: "${subtitleEs}"`);
  const phase1Es = await page.textContent('#phase-1');
  if (!phase1Es.includes('Usuarios')) throw new Error(`Fase 1 ES inesperada: "${phase1Es}"`);
  const welcomeEs = await page.innerHTML('#ai-messages .msg.ai .msg-bubble');
  if (!/qui[ée]nes participan/i.test(welcomeEs)) throw new Error('Mensaje de bienvenida ES inesperado');
  const sendBtnEs = await page.textContent('#ai-send');
  if (!sendBtnEs.includes('Analizar')) throw new Error(`Botón enviar ES inesperado: "${sendBtnEs}"`);
  console.log('✅ Interfaz por defecto en español');

  // ── 2) Cambiar a inglés ──────────────────────────────────────────────────
  await page.click('#ai-lang-switch .lang-btn[data-lang="en"]');

  const subtitleEn = await page.textContent('.ai-subtitle');
  if (!subtitleEn.includes('Iterative')) throw new Error(`Subtítulo EN inesperado: "${subtitleEn}"`);
  const phase1En = await page.textContent('#phase-1');
  if (!phase1En.includes('Users')) throw new Error(`Fase 1 EN inesperada: "${phase1En}"`);
  const welcomeEn = await page.innerHTML('#ai-messages .msg.ai .msg-bubble');
  if (!welcomeEn.includes('Let')) throw new Error('Mensaje de bienvenida EN inesperado');
  const sendBtnEn = await page.textContent('#ai-send');
  if (!sendBtnEn.includes('Analyze')) throw new Error(`Botón enviar EN inesperado: "${sendBtnEn}"`);
  const placeholderEn = await page.getAttribute('#ai-scenario', 'placeholder');
  if (!placeholderEn.toLowerCase().includes('process')) throw new Error(`Placeholder EN inesperado: "${placeholderEn}"`);
  const hintEn = await page.textContent('#ai-hint');
  if (!hintEn.includes('Ctrl+Enter to send')) throw new Error(`Hint EN inesperado: "${hintEn}"`);

  const docLang = await page.evaluate(() => document.documentElement.lang);
  if (docLang !== 'en') throw new Error(`document.lang inesperado: "${docLang}"`);

  const enActive = await page.evaluate(() =>
    document.querySelector('#ai-lang-switch .lang-btn[data-lang="en"]').classList.contains('active'));
  if (!enActive) throw new Error('El botón EN no quedó marcado como activo');

  const stored = await page.evaluate(() => localStorage.getItem('bpmnAiLang'));
  if (stored !== 'en') throw new Error(`localStorage bpmnAiLang inesperado: "${stored}"`);
  console.log('✅ Cambiado a inglés: chrome estático traducido');

  // ── Persistencia tras recargar ───────────────────────────────────────────
  await page.reload();
  await page.waitForSelector('#ai-fab', { state: 'visible' });
  await page.click('#ai-fab');
  await page.waitForSelector('#ai-panel.open');
  const subtitleAfterReload = await page.textContent('.ai-subtitle');
  if (!subtitleAfterReload.includes('Iterative')) throw new Error('El idioma EN no persistió tras recargar');
  console.log('✅ Preferencia de idioma persistida tras recargar');

  // ── 3) Respuestas de la IA en inglés ────────────────────────────────────
  await page.fill('#ai-scenario', DESCRIPTION);
  await page.click('#ai-send');
  await waitNoTyping(page);
  await page.waitForSelector('#structure-card', { timeout: TIMEOUT });

  const allAiMsgs = await page.$$eval('#ai-messages .msg.ai .msg-bubble', els => els.map(e => e.innerHTML).join('\n---\n'));
  if (!/drawn the structure/i.test(allAiMsgs)) throw new Error('La respuesta de la IA no está en inglés: ' + allAiMsgs.slice(0, 300));
  console.log('✅ Respuesta de la IA (estructura) en inglés');

  await page.click('#btn-confirm-main');
  await page.waitForSelector('#flow-mode-card', { timeout: TIMEOUT });
  const flowModeText = await page.textContent('#flow-mode-card');
  if (!/How do you want to define the process/i.test(flowModeText)) throw new Error('La tarjeta de modo de flujo no está en inglés: ' + flowModeText);
  console.log('✅ Tarjeta de modo de flujo en inglés');
  await page.click('#btn-flow-mode-manual');
  await waitNoTyping(page);
  await page.waitForSelector('#start-card', { timeout: TIMEOUT });
  const allAiMsgs2 = await page.$$eval('#ai-messages .msg.ai .msg-bubble', els => els.map(e => e.innerHTML).join('\n---\n'));
  if (!/Looking for the process start point/i.test(allAiMsgs2)) throw new Error('El mensaje tras confirmar la estructura no está en inglés: ' + allAiMsgs2.slice(-300));
  console.log('✅ Respuesta de la IA (inicio del flujo paso a paso) en inglés');

  // ── 4) Volver a español ──────────────────────────────────────────────────
  await page.click('#ai-lang-switch .lang-btn[data-lang="es"]');
  const subtitleBackEs = await page.textContent('.ai-subtitle');
  if (!subtitleBackEs.includes('Generación')) throw new Error(`Subtítulo no volvió a ES: "${subtitleBackEs}"`);
  const esActive = await page.evaluate(() =>
    document.querySelector('#ai-lang-switch .lang-btn[data-lang="es"]').classList.contains('active'));
  if (!esActive) throw new Error('El botón ES no quedó marcado como activo');
  console.log('✅ Vuelto a español correctamente');

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  if (errors.length > 0) throw new Error('Hubo errores de consola');
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
