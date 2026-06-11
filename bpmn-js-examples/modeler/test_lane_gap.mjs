/**
 * E2E: cuando la organización principal tiene varios departamentos (lanes),
 * la primera lane debe empezar exactamente donde empieza el pool principal
 * (mismo y), sin un hueco vacío entre el borde superior del pool y la
 * primera lane. Además, la suma de las alturas de las lanes debe coincidir
 * con la altura del pool (ninguna lane se sale del pool).
 */
import { chromium } from 'playwright';

const TIMEOUT = 120_000;

const DESCRIPCION = `En mi proceso participa el cliente que compra online y mi empresa, una
tienda llamada MiTienda con los departamentos de Ventas, Almacén y Logística.
El cliente envía un pedido (mensaje de inicio). Ventas registra el pedido,
Almacén prepara el paquete y Logística lo envía al cliente con un mensaje de
confirmación, momento en el que el proceso termina.`;

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

  const xml = await page.evaluate(async () => (await window._modeler.saveXML({ format: true })).xml);

  const poolMatch = xml.match(/bpmnElement="Part_Main"[\s\S]*?<dc:Bounds x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  if (!poolMatch) throw new Error('No se encontró el shape del pool principal');
  const [, , poolY, , poolH] = poolMatch.map(Number);
  console.log(`   Pool principal: y=${poolY} height=${poolH}`);

  const laneMatches = [...xml.matchAll(/bpmnElement="Lane\d+"[\s\S]*?<dc:Bounds x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
    .map(m => ({ y: Number(m[2]), h: Number(m[4]) }));
  if (laneMatches.length !== 3) throw new Error(`Se esperaban 3 lanes, encontradas ${laneMatches.length}`);
  console.log('   Lanes:', JSON.stringify(laneMatches));

  const lanesTop    = Math.min(...laneMatches.map(l => l.y));
  const lanesBottom = Math.max(...laneMatches.map(l => l.y + l.h));
  const poolBottom  = poolY + poolH;
  if (lanesTop !== poolY) throw new Error(`La primera lane (y=${lanesTop}) no coincide con el borde superior del pool (y=${poolY}) — hay un hueco vacío`);
  if (lanesBottom !== poolBottom) throw new Error(`Las lanes (bottom=${lanesBottom}) no llenan el pool (bottom=${poolBottom})`);

  console.log('✅ No hay hueco entre el pool principal y la primera lane');

  console.log(`\n   🔍 Errores de página: ${errors.length}`);
  if (errors.length > 0) throw new Error('Hubo errores de consola');
  console.log('\n=== COMPLETADO ===');
  await browser.close();
})().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
