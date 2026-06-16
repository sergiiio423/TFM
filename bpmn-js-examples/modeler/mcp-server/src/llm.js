import { t } from '../../src/i18n.js';

// ─── LLAMADA A LA API ─────────────────────────────────────────────────────────
// Por defecto se usa el modelo GPT más potente disponible (gpt-4.1, y si no
// gpt-4o). GitHub Models limita las peticiones POR MODELO y día (p.ej.
// 150/día para gpt-4o-mini), así que si un modelo falla (cuota 429, modelo
// retirado/desconocido, error transitorio...) se prueba con el siguiente de
// la lista, de más a menos potente; solo se lanza error si fallan TODOS.
export const LLM_MODELS = ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'Phi-4'];
let _llmModelIdx = 0; // recuerda el último modelo que funcionó en esta sesión

export function getApiKey() {
  const key = process.env.GITHUB_TOKEN;
  if (!key) throw new Error('Falta GITHUB_TOKEN en el entorno del servidor MCP (ver mcp-server/.env.example)');
  return key;
}

export async function callOpenAI(apiKey, systemPrompt, messages) {
  let lastErr = null;

  for (let globalRetry = 0; globalRetry < 3; globalRetry++) {
    let minWaitMs = 0;
    let allRateLimited = true;

    for (let k = 0; k < LLM_MODELS.length; k++) {
      const idx   = (_llmModelIdx + k) % LLM_MODELS.length;
      const model = LLM_MODELS[idx];
      let response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000); // 30s por modelo
      try {
        response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            temperature: 0.3,
            max_tokens: 8000
          }),
          signal: controller.signal
        });
      } catch(e) { clearTimeout(timer); lastErr = e; allRateLimited = false; continue; }
      clearTimeout(timer);

      if (response.ok) {
        _llmModelIdx = idx;
        const data = await response.json();
        return data.choices[0].message.content.trim();
      }

      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `Error ${response.status} en la API`;
      console.warn(`Modelo "${model}" no disponible (${msg}), probando con el siguiente...`);
      lastErr = new Error(msg);

      if (response.status === 429) {
        // Extraer el tiempo de espera sugerido para agrupar el backoff global
        const waitMatch = msg.match(/wait (\d+) second/i);
        if (waitMatch) minWaitMs = Math.max(minWaitMs, parseInt(waitMatch[1]) * 1000);
      } else {
        allRateLimited = false;
      }
    }

    // Si todos los modelos dieron 429, esperar el mínimo sugerido antes de reintentar
    if (allRateLimited && globalRetry < 2) {
      const wait = minWaitMs > 0 ? Math.min(minWaitMs, 60000) : 15000;
      console.warn(`Todos los modelos en rate-limit. Reintentando en ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    } else if (!allRateLimited) {
      break; // error no recuperable (no es rate-limit): no reintentar
    }
  }

  throw new Error(`Ningún modelo disponible (cuota agotada o modelos retirados). Espera unas horas o usa otro token. Último error: ${lastErr?.message || '?'}`);
}

export function callAPI(apiKey, systemPrompt, messages) {
  return callOpenAI(apiKey, systemPrompt, messages);
}

/**
 * Extrae y parsea el PRIMER objeto JSON completo de una respuesta del LLM.
 * Tolera texto extra antes/después del objeto (explicaciones, un segundo
 * objeto JSON, vallas ```json```...), que rompían el JSON.parse anterior
 * basado en un regex codicioso del primer "{" al ÚLTIMO "}".
 */
export function parseLLMJson(raw) {
  const text = (raw || '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(text); } catch (e) { /* hay texto extra: se busca el objeto */ }
  const start = text.indexOf('{');
  if (start === -1) throw new Error('La respuesta no contiene JSON');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = inStr; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  return JSON.parse(text.slice(start)); // JSON truncado: que el error sea descriptivo
}

export function cleanXML(raw) {
  let xml = raw.replace(/```xml/gi, '').replace(/```bpmn/gi, '').replace(/```/g, '').trim();
  const idx = xml.indexOf('<?xml');
  if (idx > -1) xml = xml.substring(idx);
  if (!xml.startsWith('<?xml')) { const d = xml.indexOf('<definitions'); if (d > -1) xml = xml.substring(d); }

  // ── Reparación 1: comilla de cierre olvidada antes de />
  // El LLM a veces genera: height="36/>  en lugar de  height="36"/>
  // Patrón: ="VALOR/>  →  ="VALOR"/>
  xml = xml.replace(/="([^"<>\n\r]*)\s*\/>/g, '="$1"/>');

  // ── Reparación 2: truncaciones (XML cortado antes de </definitions>)
  if (!xml.includes('</definitions>')) {
    // Recortar hasta el último '>' completo (eliminar tag a medias)
    const lastGt = xml.lastIndexOf('>');
    if (lastGt > 0) xml = xml.substring(0, lastGt + 1);

    const needsPlane = xml.includes('<bpmndi:BPMNPlane') && !xml.includes('</bpmndi:BPMNPlane>');
    const needsDiag  = xml.includes('<bpmndi:BPMNDiagram') && !xml.includes('</bpmndi:BPMNDiagram>');
    if (needsPlane) xml += '\n    </bpmndi:BPMNPlane>';
    if (needsDiag)  xml += '\n  </bpmndi:BPMNDiagram>';
    xml += '\n</definitions>';
  }

  if (!xml.includes('bpmndi:BPMNDiagram') && !xml.includes('BPMNDiagram'))
    throw new Error(t('errNoDiagramSection'));
  return xml;
}
