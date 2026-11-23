// DevisExpress — serveur IA (fonction Netlify), accessible à l'adresse /api/ai
//
// Le navigateur envoie { task, data } ; c'est ICI que la consigne est construite,
// pour que personne ne puisse utiliser votre clé API pour autre chose que vos devis.
//
// Variables d'environnement (Netlify > Site configuration > Environment variables) :
//   ANTHROPIC_API_KEY   votre clé Anthropic                          — ou —
//   GEMINI_API_KEY      votre clé Google AI Studio (offre gratuite)  — ou —
//   OPENAI_API_KEY      votre clé OpenAI, ou d'un service compatible (Groq…) avec OPENAI_BASE_URL
//   AI_PROVIDER         optionnel : "anthropic", "gemini" ou "openai" (sinon déduit de la clé présente)
//   SANS AUCUNE CLÉ, l'application fonctionne en mode sans IA (modèles et textes automatiques).
//   AI_MODEL            optionnel : nom du modèle à utiliser
//   ALLOWED_ORIGIN      optionnel : votre domaine, ex. https://devisexpress.fr

import { buildPrompt, TASKS } from '../../public/app/prompts.js';

const MAX_BODY = 30_000;              // taille maximale d'une requête (caractères)
const LIMIT_PER_HOUR = 60;            // demandes IA par adresse IP et par heure (limite simple)
const hits = new Map();               // compteur en mémoire (remis à zéro au redémarrage)

const json = (status, obj, origin) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  },
});

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 3_600_000) { rec.n = 0; rec.t = now; }
  rec.n++;
  hits.set(ip, rec);
  return rec.n > LIMIT_PER_HOUR;
}

async function callAnthropic(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-haiku-5-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${body?.error?.message || 'erreur'}`);
  return (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function callOpenAI(prompt) {
  // OPENAI_BASE_URL permet aussi d'utiliser un service compatible (ex. Groq : https://api.groq.com/openai/v1)
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body?.error?.message || 'erreur'}`);
  return body.choices?.[0]?.message?.content || '';
}

// Google Gemini (offre gratuite possible via Google AI Studio)
// En gratuit, un modèle peut être saturé (erreur 503/429) : on essaie alors d'autres modèles
// « Flash » disponibles pour la clé, trouvés automatiquement auprès de Google.
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
let geminiModelsCache = null;
let geminiLastGood = null;
async function geminiFlashModels() {
  if (geminiModelsCache) return geminiModelsCache;
  try {
    const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY } });
    const body = await res.json();
    geminiModelsCache = (body.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(n => /flash/i.test(n) && !/(image|tts|audio|live|thinking|exp)/i.test(n));
  } catch (e) { geminiModelsCache = []; }
  return geminiModelsCache;
}
async function geminiOnce(model, prompt) {
  const res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(12000), // un modèle trop lent est abandonné au profit du suivant
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 8000 } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(`Gemini ${model} ${res.status}: ${body?.error?.message || 'erreur'}`); err.status = res.status; throw err; }
  const text = (body.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if (!text) { const err = new Error(`Gemini ${model}: réponse vide`); err.status = 502; throw err; }
  return text;
}
async function callGemini(prompt) {
  const preferred = [process.env.AI_MODEL, geminiLastGood, 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean);
  const tried = new Set();
  const start = Date.now();
  let lastErr;
  const attempt = async (model) => {
    if (tried.has(model) || Date.now() - start > 15000) return null; // on reste sous la limite de 26 s de Netlify
    tried.add(model);
    try { const t = await geminiOnce(model, prompt); geminiLastGood = model; return t; }
    catch (e) { lastErr = e; console.error('[ai]', e.message); if (e.status === 400 || e.status === 401 || e.status === 403) throw e; return null; }
  };
  for (const m of preferred) { const t = await attempt(m); if (t) return t; }
  for (const m of (await geminiFlashModels()).slice(0, 6)) { const t = await attempt(m); if (t) return t; }
  throw lastErr || new Error('Gemini indisponible');
}

function currentProvider() {
  const p = (process.env.AI_PROVIDER || '').toLowerCase();
  if (p) return p;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'anthropic';
}
function providerHasKey(p) {
  if (p === 'openai') return !!process.env.OPENAI_API_KEY;
  if (p === 'gemini') return !!process.env.GEMINI_API_KEY;
  return !!process.env.ANTHROPIC_API_KEY;
}

export default async (req, context) => {
  const allowed = process.env.ALLOWED_ORIGIN || '';
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': allowed || origin || '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' } });
  }
  const provider = currentProvider();
  const hasKey = providerHasKey(provider);
  // GET /api/ai : l'application demande simplement si l'IA est disponible
  if (req.method === 'GET') return json(200, { enabled: hasKey }, allowed);
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });
  if (allowed && origin && origin !== allowed) return json(403, { error: 'Origine non autorisée.' });

  if (!hasKey) return json(503, { error: "L'assistant IA n'est pas encore configuré : ajoutez la clé API dans les réglages Netlify (voir le guide)." }, allowed);

  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'inconnu';
  if (rateLimited(ip)) return json(429, { error: 'Trop de demandes. Réessayez dans un moment.' }, allowed);

  let payload;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'Demande trop longue.' }, allowed);
    payload = JSON.parse(raw);
  } catch (e) { return json(400, { error: 'Demande invalide.' }, allowed); }

  const { task, data } = payload || {};
  if (!TASKS.includes(task)) return json(400, { error: 'Tâche inconnue.' }, allowed);

  try {
    const prompt = buildPrompt(task, data || {});
    const text = provider === 'openai' ? await callOpenAI(prompt) : provider === 'gemini' ? await callGemini(prompt) : await callAnthropic(prompt);
    return json(200, { text }, allowed);
  } catch (e) {
    console.error('[ai]', e.message);
    return json(502, { error: "L'assistant IA n'a pas répondu. Réessayez dans un instant." }, allowed);
  }
};

export const config = { path: '/api/ai' };
