import { t } from '../../src/i18n.js';

// ─── PROVEEDOR: Azure OpenAI o GitHub Models ──────────────────────────────────
// Si están presentes AZURE_OPENAI_KEY + AZURE_OPENAI_ENDPOINT → Azure OpenAI.
// Si solo está GITHUB_TOKEN → GitHub Models (fallback legacy).
function getProvider() {
  const azureKey      = process.env.AZURE_OPENAI_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const githubToken   = process.env.GITHUB_TOKEN;

  if (azureKey && azureEndpoint) return { type: 'azure', key: azureKey, endpoint: azureEndpoint.replace(/\/$/, '') };
  if (githubToken)                return { type: 'github', key: githubToken };
  throw new Error('Falta configuración LLM: define AZURE_OPENAI_KEY + AZURE_OPENAI_ENDPOINT, o GITHUB_TOKEN.');
}

export function getApiKey() {
  return getProvider().key;
}

// ─── AZURE OPENAI ─────────────────────────────────────────────────────────────
const AZURE_DEPLOYMENT   = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
const AZURE_API_VERSION  = '2024-08-01-preview';

async function callAzure(provider, systemPrompt, messages) {
  const url = `${provider.endpoint}/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${AZURE_API_VERSION}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000); // 60s
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': provider.key },
      body: JSON.stringify({
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.3,
        max_tokens: 8000
      }),
      signal: controller.signal
    });
  } finally { clearTimeout(timer); }

  if (response.ok) {
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }
  const err = await response.json().catch(() => ({}));
  throw new Error(err.error?.message || `Azure OpenAI error ${response.status}`);
}

// ─── GITHUB MODELS (fallback) ─────────────────────────────────────────────────
export const LLM_MODELS = ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'Phi-4'];
let _llmModelIdx = 0;

async function callGitHub(provider, systemPrompt, messages) {
  let lastErr = null;

  for (let globalRetry = 0; globalRetry < 3; globalRetry++) {
    let minWaitMs = 0;
    let allRateLimited = true;

    for (let k = 0; k < LLM_MODELS.length; k++) {
      const idx   = (_llmModelIdx + k) % LLM_MODELS.length;
      const model = LLM_MODELS[idx];
      let response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.key}` },
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
        const waitMatch = msg.match(/wait (\d+) second/i);
        if (waitMatch) minWaitMs = Math.max(minWaitMs, parseInt(waitMatch[1]) * 1000);
      } else {
        allRateLimited = false;
      }
    }

    if (allRateLimited && globalRetry < 2) {
      const wait = minWaitMs > 0 ? Math.min(minWaitMs, 60000) : 15000;
      console.warn(`Todos los modelos en rate-limit. Reintentando en ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    } else if (!allRateLimited) {
      break;
    }
  }

  throw new Error(`Ningún modelo disponible (cuota agotada o modelos retirados). Espera unas horas o usa otro token. Último error: ${lastErr?.message || '?'}`);
}

// ─── PUNTO DE ENTRADA ÚNICO ───────────────────────────────────────────────────
export async function callOpenAI(apiKey, systemPrompt, messages) {
  const provider = getProvider();
  if (provider.type === 'azure') return callAzure(provider, systemPrompt, messages);
  return callGitHub(provider, systemPrompt, messages);
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
