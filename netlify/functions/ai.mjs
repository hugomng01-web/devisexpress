// DevisExpress — serveur IA (fonction Netlify), accessible à l'adresse /api/ai
//
// Le navigateur envoie { task, data } ; c'est ICI que la consigne est construite,
// pour que personne ne puisse utiliser votre clé API pour autre chose que vos devis.
//
// Variables d'environnement (Netlify > Site configuration > Environment variables) :
//   ANTHROPIC_API_KEY   votre clé Anthropic (recommandé)            — ou —
//   OPENAI_API_KEY      votre clé OpenAI (avec AI_PROVIDER=openai)
//   AI_PROVIDER         "anthropic" (par défaut) ou "openai"
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
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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

export default async (req, context) => {
  const allowed = process.env.ALLOWED_ORIGIN || '';
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': allowed || origin || '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } });
  }
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });
  if (allowed && origin && origin !== allowed) return json(403, { error: 'Origine non autorisée.' });

  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const hasKey = provider === 'openai' ? !!process.env.OPENAI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
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
    const text = provider === 'openai' ? await callOpenAI(prompt) : await callAnthropic(prompt);
    return json(200, { text }, allowed);
  } catch (e) {
    console.error('[ai]', e.message);
    return json(502, { error: "L'assistant IA n'a pas répondu. Réessayez dans un instant." }, allowed);
  }
};

export const config = { path: '/api/ai' };
