// DevisExpress — application (v1)
// Données enregistrées dans le navigateur de l'artisan (localStorage).
import { buildPrompt, parseJSON } from './prompts.js';
import { generatePDF } from './pdf.js';
import { MODELES, texteIntro } from './modeles.js';

/* =========================================================
   Constantes
   ========================================================= */
const STORE_KEY = 'devisexpress_v1';
const UNITES = ['u', 'h', 'j', 'm²', 'ml', 'm³', 'kg', 'forfait', 'lot', 'ens.'];
const TVAS = [20, 10, 5.5, 0];
const STATUTS = {
  brouillon: { label: 'Brouillon', cls: 'st-brouillon' },
  envoye: { label: 'Envoyé', cls: 'st-envoye' },
  signe: { label: 'Signé', cls: 'st-signe' },
  refuse: { label: 'Refusé', cls: 'st-refuse' },
};

const DEFAULT_TEMPLATES = [
  {
    jours: 3,
    email: `Objet : Votre devis {numero} – {objet}

Bonjour {client},

Je me permets de revenir vers vous au sujet du devis n° {numero} que je vous ai transmis le {date_envoi} pour {objet}, d'un montant de {montant} TTC.

Avez-vous pu en prendre connaissance ? Je reste à votre disposition pour répondre à vos questions ou ajuster certains points si besoin.

Bien cordialement,
{artisan}
{tel}`,
    sms: `Bonjour {client}, c'est {artisan}. Avez-vous pu regarder le devis {numero} pour {objet} ? Je reste dispo au {tel} pour toute question. Bonne journée !`,
  },
  {
    jours: 7,
    email: `Objet : Devis {numero} – réservation de votre date de chantier

Bonjour {client},

Je reviens vers vous concernant votre projet ({objet}). Mon planning se remplit pour les prochaines semaines : si vous souhaitez que je vous réserve une date, il vous suffit de me retourner le devis signé ou de m'appeler au {tel}.

Si certains points vous font hésiter, dites-le-moi : nous pouvons en discuter et adapter la proposition.

Bien cordialement,
{artisan}`,
    sms: `Bonjour {client}, {artisan} ici. Mon planning se remplit : souhaitez-vous que je réserve une date pour {objet} (devis {numero}) ? Un simple retour du devis signé suffit. Merci !`,
  },
  {
    jours: 14,
    email: `Objet : Devis {numero} – dernier message de ma part

Bonjour {client},

Sans nouvelles de votre part, je suppose que votre projet ({objet}) est reporté ou a pris une autre direction, ce qui est tout à fait compréhensible.

Le devis n° {numero} reste valable jusqu'au {validite}. Si vous souhaitez le reprendre d'ici là, ou plus tard, n'hésitez pas à me recontacter au {tel}.

Je vous souhaite une bonne continuation,
{artisan}`,
    sms: `Bonjour {client}, dernier petit message de {artisan} au sujet du devis {numero} ({objet}), valable jusqu'au {validite}. N'hésitez pas à me rappeler au {tel} si le projet se concrétise.`,
  },
];

function defaultProfil() {
  return {
    nom: '', metier: '', formeJuridique: '', capital: '', adresse: '', cp: '', ville: '', tel: '', email: '',
    siret: '', rm: '', tvaNum: '', tvaRegime: 'normal', tvaDefaut: 10,
    assuranceType: 'décennale', assureur: '', assuranceNum: '', assuranceZone: 'France métropolitaine',
    mediateur: '', mentionsSupp: '',
    conditionsPaiement: 'Acompte à la signature, solde à réception de facture. Paiement par virement ou chèque.',
    validiteJours: 30, acompteDefaut: 30, prefixe: 'D', prochainNumero: 1,
    couleur: '#1e40af', logo: '', templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)),
  };
}
const defaultState = () => ({ version: 1, profil: defaultProfil(), prestations: [], devis: [], modeles: [] });

/* =========================================================
   Utilitaires
   ========================================================= */
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const r2 = n => Math.round((Number(n) || 0) * 100 + Number.EPSILON * 100) / 100;
function parseNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[\s  €]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function fmtNum(n, dec = 2) {
  const v = r2(n);
  const [i, d] = Math.abs(v).toFixed(dec).split('.');
  return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? ',' + d : '');
}
const fmtMoney = n => fmtNum(n) + ' €';
function fmtQty(n) {
  const v = Math.round(parseNum(n) * 1000) / 1000;
  return Number.isInteger(v) ? fmtNum(v, 0) : String(v).replace('.', ',');
}
function isoLocal(d = new Date()) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function addDays(iso, n) { const d = new Date((iso || isoLocal()) + 'T12:00:00'); d.setDate(d.getDate() + Number(n || 0)); return isoLocal(d); }
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, val) { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((o, k) => (o[k] ??= {}), obj); t[last] = val; }
const fmt = { money: fmtMoney, qty: fmtQty, date: fmtDate, addDays };

/* =========================================================
   Stockage
   ========================================================= */
let storageOk = true;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { storageOk = false; }
  return defaultState();
}
function migrate(s) {
  const base = defaultState();
  s.profil = { ...base.profil, ...(s.profil || {}) };
  if (!Array.isArray(s.profil.templates) || s.profil.templates.length !== 3) s.profil.templates = base.profil.templates;
  s.prestations = Array.isArray(s.prestations) ? s.prestations : [];
  s.devis = Array.isArray(s.devis) ? s.devis : [];
  s.modeles = Array.isArray(s.modeles) ? s.modeles : [];
  for (const d of s.devis) {
    d.client ??= {}; d.chantier ??= {}; d.lignes ??= []; d.relances ??= [];
  }
  return s;
}
let state = load();
let saveTimer = null, warnedStorage = false;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); storageOk = true; }
    catch (e) {
      storageOk = false;
      if (!warnedStorage) { warnedStorage = true; toast("Ce navigateur n'enregistre pas les données : pensez à exporter une sauvegarde (Profil > Sauvegarde).", 'warn', 7000); }
    }
  }, 250);
}

/* =========================================================
   Plateforme : IA, téléchargement, dictée
   (dans claude.ai : capacités de la page ; en ligne : votre serveur /api/ai)
   ========================================================= */
const caps = {};
const inClaude = () => !!(window.claude && typeof window.claude.use === 'function');
function cap(name) {
  if (!inClaude()) return Promise.resolve(null);
  if (!caps[name]) caps[name] = window.claude.use(name).catch(() => null);
  return caps[name];
}

class AIError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
async function askAI(task, data) {
  const sample = await cap('sample');
  if (sample) {
    try {
      const res = await sample(buildPrompt(task, data), { modelTier: 'quick' });
      return res.text || '';
    } catch (e) {
      if (e && e.code === 'not_granted') throw new AIError("L'assistant IA n'a pas été autorisé.", 'not_granted');
      if (e && e.code === 'rate_limited') throw new AIError("Trop de demandes d'un coup : réessayez dans un instant.", 'rate_limited');
      throw new AIError("L'assistant IA n'a pas répondu. Réessayez.", 'error');
    }
  }
  let res;
  try {
    res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, data }) });
  } catch (e) { throw new AIError("Impossible de joindre l'assistant IA (connexion ?).", 'network'); }
  let body = {};
  try { body = await res.json(); } catch (e) { /* réponse non JSON */ }
  if (!res.ok) throw new AIError(body.error || "L'assistant IA n'est pas configuré sur ce site (voir le guide de mise en ligne).", 'server');
  return body.text || '';
}

// L'IA est-elle disponible ? (clé configurée sur le serveur, ou démo dans claude.ai)
let aiOn = false;
function setAI(on) { aiOn = !!on; document.body.classList.toggle('ai-on', aiOn); }
async function detectAI() {
  if (inClaude()) { setAI(!!(await cap('sample'))); return; }
  try {
    const r = await fetch('/api/ai', { method: 'GET', headers: { Accept: 'application/json' } });
    const b = await r.json();
    setAI(r.ok && b.enabled);
  } catch (e) { setAI(false); }
}

async function saveFile(filename, bytes, mime) {
  const dl = await cap('downloads');
  const blob = new Blob([bytes], { type: mime });
  if (dl) {
    try { await dl.save({ filename, data: blob }); return true; }
    catch (e) { if (e && e.code === 'declined') return false; throw e; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  return true;
}

// Dictée : capacité "dictation" dans claude.ai, sinon reconnaissance vocale du navigateur (Chrome, Edge, Safari).
const dict = { active: false, target: null, base: '', btn: null, engine: null, rec: null, hooked: false };
function dictationAvailable() { return inClaude() || !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function dictSetUI(on) {
  dict.active = on;
  if (dict.btn) { dict.btn.classList.toggle('listening', on); dict.btn.querySelector('span').textContent = on ? 'Arrêter' : 'Dicter'; }
}
function dictWrite(text, final) {
  const ta = dict.target; if (!ta) return;
  const sep = dict.base && !/\s$/.test(dict.base) ? ' ' : '';
  ta.value = dict.base + sep + text;
  if (final) dict.base = ta.value;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
function toggleDictation(btn, ta) {
  if (dict.active) {
    if (dict.engine === 'claude') caps.dictation?.then(d => d && d.stop()).catch(() => {});
    else if (dict.rec) dict.rec.stop();
    dictSetUI(false);
    return;
  }
  dict.target = ta; dict.btn = btn; dict.base = ta.value;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (inClaude() && dict.claude) {
    const d = dict.claude;
    dict.engine = 'claude';
    // start() doit être appelé directement depuis le clic
    d.start().then(() => dictSetUI(true)).catch(e => {
      dictSetUI(false);
      toast(e && e.code === 'not_granted' ? 'Micro refusé : vous pouvez taper le texte.' : 'Dictée indisponible ici : tapez le texte.', 'warn');
    });
    dictSetUI(true);
    return;
  }
  if (SR) {
    dict.engine = 'web';
    const rec = new SR();
    rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) dictWrite(r[0].transcript.trim(), true); else interim += r[0].transcript;
      }
      if (interim) dictWrite(interim.trim(), false);
    };
    rec.onerror = ev => { if (ev.error === 'not-allowed') toast('Micro refusé : vous pouvez taper le texte.', 'warn'); };
    rec.onend = () => dictSetUI(false);
    dict.rec = rec;
    try { rec.start(); dictSetUI(true); } catch (e) { toast('Dictée indisponible : tapez le texte.', 'warn'); }
    return;
  }
  toast('La dictée vocale nécessite Chrome, Edge ou Safari.', 'warn');
}
async function initDictationClaude() {
  const d = await cap('dictation');
  if (!d || dict.hooked) return;
  dict.claude = d; dict.hooked = true;
  d.onPartial(({ text }) => dictWrite(text, false));
  d.onFinal(({ text }) => dictWrite(text, true));
  d.onState(({ state: st }) => dictSetUI(st === 'listening'));
}

/* =========================================================
   Calculs
   ========================================================= */
function computeTotals(dv, p = state.profil) {
  const franchise = p.tvaRegime === 'franchise';
  const remise = Math.min(Math.max(parseNum(dv.remisePct), 0), 100) / 100;
  let brut = 0; const byRate = {};
  for (const l of dv.lignes) {
    const ht = parseNum(l.qte) * parseNum(l.pu);
    brut += ht;
    const rate = franchise ? 0 : parseNum(l.tva);
    byRate[rate] = (byRate[rate] || 0) + ht;
  }
  const tvaLines = Object.keys(byRate).map(Number).sort((a, b) => b - a)
    .map(rate => { const base = r2(byRate[rate] * (1 - remise)); return { rate, base, montant: r2(base * rate / 100) }; });
  const htNet = r2(tvaLines.reduce((s, t) => s + t.base, 0));
  const tva = franchise ? 0 : r2(tvaLines.reduce((s, t) => s + t.montant, 0));
  const ttc = r2(htNet + tva);
  return {
    brut: r2(brut), remiseMontant: r2(r2(brut) - htNet), htNet, tva, ttc, franchise,
    tvaLines: franchise ? [] : tvaLines.filter(t => t.rate > 0),
    acompte: r2(ttc * Math.min(Math.max(parseNum(dv.acomptePct), 0), 100) / 100),
  };
}
const validiteDate = dv => addDays(dv.date, parseNum(dv.validiteJours) || 30);

function relanceInfo(dv) {
  if (dv.statut !== 'envoye' || !dv.dateEnvoi) return null;
  const tpl = state.profil.templates;
  const n = dv.relances.length;
  const today = isoLocal();
  if (n >= tpl.length) return { niveau: null, termine: true };
  const due = addDays(dv.dateEnvoi, parseNum(tpl[n].jours));
  return { niveau: n + 1, due, enRetard: due <= today, joursRestants: daysBetween(today, due) };
}
function fillTemplate(str, dv) {
  const p = state.profil; const t = computeTotals(dv);
  const vars = {
    client: dv.client.nom || 'Madame, Monsieur', numero: dv.numero, objet: dv.chantier.objet || 'vos travaux',
    montant: fmtMoney(t.ttc), date_envoi: fmtDate(dv.dateEnvoi || dv.date), validite: fmtDate(validiteDate(dv)),
    artisan: p.nom || '', tel: p.tel || '', email: p.email || '',
  };
  return String(str || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/* =========================================================
   Devis : création, numérotation
   ========================================================= */
function nextNumero() {
  const p = state.profil;
  const n = parseInt(p.prochainNumero, 10) || 1;
  p.prochainNumero = n + 1;
  return `${(p.prefixe || 'D').trim()}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
}
function newLigne(o = {}) {
  return { id: uid(), designation: '', details: '', qte: 1, unite: 'u', pu: 0, tva: state.profil.tvaDefaut ?? 10, estime: false, ...o };
}
function createDevis() {
  const p = state.profil;
  const dv = {
    id: uid(), numero: nextNumero(), date: isoLocal(), statut: 'brouillon',
    client: { nom: '', email: '', tel: '', adresse: '', cp: '', ville: '' },
    chantier: { objet: '', adresse: '', dateDebut: '', duree: '' },
    description: '', intro: '', lignes: [], remisePct: 0, acomptePct: p.acompteDefaut ?? 30,
    validiteJours: p.validiteJours ?? 30, notes: '', dateEnvoi: null, relances: [],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  state.devis.unshift(dv);
  save();
  return dv;
}
const getDevis = id => state.devis.find(d => d.id === id);
const touch = dv => { dv.updatedAt = Date.now(); save(); };

const normTxt = s => String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/[-'’()]/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
function findLib(designation) {
  const n = normTxt(designation); if (!n) return null;
  const STOPW = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'a', 'au', 'aux', 'un', 'une', 'pour', 'avec']);
  const words = t => new Set(t.split(' ').filter(w => w.length > 1 && !STOPW.has(w)));
  const A = words(n);
  let best = null, bestScore = 0;
  for (const p of state.prestations) {
    const q = normTxt(p.designation);
    if (q === n) return p;
    const B = words(q);
    let inter = 0; for (const w of A) if (B.has(w)) inter++;
    const score = inter / Math.max(1, Math.min(A.size, B.size));
    if (inter >= 2 && score >= 0.75 && score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}
function ligneDepuisModele(designation, details, qte, unite, pu, tva) {
  const hit = findLib(designation);
  if (hit) return newLigne({ designation, details: details || '', qte, unite: hit.unite || unite, pu: parseNum(hit.prixHT), tva: parseNum(hit.tva ?? state.profil.tvaDefaut) });
  return newLigne({ designation, details: details || '', qte, unite, pu: parseNum(pu), ...(tva !== undefined ? { tva: parseNum(tva) } : {}) });
}

/* Découpage simple sans IA (secours si l'IA n'est pas disponible) */
function localParse(description) {
  const lib = state.prestations;
  const parts = String(description || '').split(/\n|;|,(?!\d)|\.\s|\s\+\s|\bpuis\b|\bet\b(?=\s+(?:la|le|les|l'|un|une|des|du|\d))/i)
    .map(s => s.trim()).filter(s => s.length > 2);
  return parts.map(txt => {
    let qte = 1, unite = 'u';
    const m = txt.match(/(\d+(?:[.,]\d+)?)\s*(h\b|heures?|j\b|jours?|m2|m²|ml|mètres? linéaires?|m3|m³|kg|forfait)/i);
    if (m) {
      qte = parseNum(m[1]);
      const u = m[2].toLowerCase();
      unite = u.startsWith('h') ? 'h' : u.startsWith('j') ? 'j' : /m2|m²/.test(u) ? 'm²' : /ml|lin/.test(u) ? 'ml' : /m3|m³/.test(u) ? 'm³' : u === 'kg' ? 'kg' : 'forfait';
    } else {
      const m2 = txt.match(/^(\d+)\s+(.+)/) || txt.match(/\b(\d+(?:[.,]\d+)?)\s+[a-zà-ÿœ'-]{2,}[sx]\b/i);
      if (m2) qte = parseNum(m2[1]);
    }
    const norm = s => String(s).toLowerCase().replace(/œ/g, 'oe').replace(/[-']/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const STOP = ['pour', 'avec', 'dans', 'fourniture', 'pose', 'ancien', 'ancienne'];
    const low = norm(txt);
    const hit = lib.find(p => p.designation && norm(p.designation).split(/[\s()]+/).filter(w => w.length > 3 && !STOP.includes(w)).some(w => low.includes(w)));
    const designation = txt.charAt(0).toUpperCase() + txt.slice(1);
    return hit
      ? newLigne({ designation: hit.designation, details: '', qte, unite: hit.unite || unite, pu: parseNum(hit.prixHT), tva: hit.tva ?? state.profil.tvaDefaut })
      : newLigne({ designation: designation.slice(0, 120), qte, unite, pu: 0, estime: false });
  });
}

/* =========================================================
   Interface : toasts, fenêtres
   ========================================================= */
function toast(msg, kind = 'ok', ms = 3500) {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`; el.textContent = msg;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}
function modal(html, { wide = false } = {}) {
  return new Promise(resolve => {
    const root = $('#modal');
    root.innerHTML = `<div class="modal-back"></div><div class="modal-box ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    root.hidden = false;
    const close = v => { root.hidden = true; root.innerHTML = ''; resolve(v); };
    root.querySelector('.modal-back').onclick = () => close(null);
    root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => close(b.dataset.close));
    root._close = close;
    const first = root.querySelector('input,textarea,button.primary'); if (first) first.focus();
  });
}
function confirmBox(msg, ok = 'Confirmer', danger = false) {
  return modal(`<p class="modal-msg">${esc(msg)}</p><div class="modal-actions"><button class="btn" data-close="">Annuler</button><button class="btn ${danger ? 'danger' : 'primary'}" data-close="ok">${esc(ok)}</button></div>`).then(v => v === 'ok');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copié dans le presse-papiers'); }
  catch (e) {
    modal(`<h3>Copiez le texte</h3><textarea class="copy-area" readonly>${esc(text)}</textarea><div class="modal-actions"><button class="btn primary" data-close="">Fermer</button></div>`);
    setTimeout(() => { const ta = $('.copy-area'); if (ta) { ta.focus(); ta.select(); } }, 50);
  }
}
const icon = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const statutBadge = s => `<span class="badge ${STATUTS[s]?.cls || ''}">${STATUTS[s]?.label || s}</span>`;

/* =========================================================
   Routage
   ========================================================= */
let currentId = null;
const VIEWS = ['tableau', 'devis', 'editeur', 'relances', 'prestations', 'profil'];
function go(view, id) {
  if (id) currentId = id;
  if (location.hash === '#' + view) render(); else location.hash = view;
}
function currentView() {
  const h = location.hash.replace('#', '');
  return VIEWS.includes(h) ? h : 'tableau';
}
function render() {
  let view = currentView();
  if (view === 'editeur' && !getDevis(currentId)) view = 'devis';
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.view === (view === 'editeur' ? 'devis' : view)));
  const el = $('#view');
  el.innerHTML = ({ tableau: viewTableau, devis: viewDevisList, editeur: viewEditeur, relances: viewRelances, prestations: viewPrestations, profil: viewProfil })[view]();
  el.dataset.view = view;
  if (view === 'editeur') afterEditorRender();
  const badge = $('#relance-count');
  const n = state.devis.filter(d => relanceInfo(d)?.enRetard).length;
  if (badge) { badge.textContent = n; badge.hidden = !n; }
  window.scrollTo(0, 0);
}

/* =========================================================
   Vue : tableau de bord
   ========================================================= */
function profilComplet() { const p = state.profil; return !!(p.nom && p.siret && p.adresse && p.tel); }
function viewTableau() {
  const all = state.devis;
  const month = isoLocal().slice(0, 7);
  const duMois = all.filter(d => d.date.slice(0, 7) === month);
  const envoyes = all.filter(d => d.statut === 'envoye');
  const signes = all.filter(d => d.statut === 'signe');
  const decides = all.filter(d => d.statut === 'signe' || d.statut === 'refuse');
  const taux = decides.length ? Math.round(signes.length / decides.length * 100) : null;
  const sum = arr => arr.reduce((s, d) => s + computeTotals(d).ttc, 0);
  const aRelancer = all.map(d => ({ d, r: relanceInfo(d) })).filter(x => x.r && x.r.enRetard);
  const recents = all.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);

  return `
  <div class="page-head">
    <div><h1>Bonjour${state.profil.nom ? ' ' + esc(state.profil.nom) : ''} 👋</h1><p class="muted">Voici où en sont vos devis.</p></div>
    <button class="btn primary big" data-action="new-devis">${icon('plus')} Nouveau devis</button>
  </div>
  ${!profilComplet() ? `<div class="banner">${icon('info')}<div><strong>Complétez votre profil (2 minutes).</strong> Nom, SIRET, adresse, assurance : ces informations apparaissent automatiquement sur chaque devis.</div><button class="btn" data-action="nav" data-view="profil">Compléter</button></div>` : ''}
  ${!all.length ? `<div class="banner soft">${icon('spark')}<div><strong>Envie de voir le résultat tout de suite ?</strong> Chargez un exemple d'artisan avec quelques devis, puis modifiez-le à votre image.</div><button class="btn" data-action="load-demo">Charger un exemple</button></div>` : ''}
  <div class="kpis">
    <div class="kpi"><span>Devis ce mois-ci</span><strong>${duMois.length}</strong><em>${fmtMoney(sum(duMois))} TTC</em></div>
    <div class="kpi"><span>En attente de réponse</span><strong>${envoyes.length}</strong><em>${fmtMoney(sum(envoyes))} TTC</em></div>
    <div class="kpi"><span>Signés</span><strong>${signes.length}</strong><em>${fmtMoney(sum(signes))} TTC</em></div>
    <div class="kpi"><span>Taux de signature</span><strong>${taux === null ? '—' : taux + ' %'}</strong><em>${decides.length} devis conclus</em></div>
  </div>
  <div class="grid2">
    <section class="card">
      <div class="card-head"><h2>${icon('bell')} À relancer aujourd'hui</h2><a href="#relances" class="link">Tout voir</a></div>
      ${aRelancer.length ? `<ul class="list">${aRelancer.map(({ d, r }) => `
        <li><button class="row-btn" data-action="nav" data-view="relances"><div><strong>${esc(d.client.nom || 'Client sans nom')}</strong><span class="muted">${esc(d.numero)} · ${esc(d.chantier.objet || 'Sans objet')}</span></div><span class="badge st-warn">Relance ${r.niveau}</span></button></li>`).join('')}</ul>`
        : `<p class="empty">Aucune relance à faire aujourd'hui. ✅</p>`}
    </section>
    <section class="card">
      <div class="card-head"><h2>${icon('doc')} Derniers devis</h2><a href="#devis" class="link">Tout voir</a></div>
      ${recents.length ? `<ul class="list">${recents.map(d => `
        <li><button class="row-btn" data-action="open-devis" data-id="${d.id}"><div><strong>${esc(d.client.nom || 'Client sans nom')}</strong><span class="muted">${esc(d.numero)} · ${fmtMoney(computeTotals(d).ttc)}</span></div>${statutBadge(d.statut)}</button></li>`).join('')}</ul>`
        : `<p class="empty">Aucun devis pour l'instant.</p>`}
    </section>
  </div>`;
}

/* =========================================================
   Vue : liste des devis
   ========================================================= */
let listFilter = 'tous', listSearch = '';
function viewDevisList() {
  const q = listSearch.toLowerCase();
  const rows = state.devis
    .filter(d => listFilter === 'tous' || d.statut === listFilter)
    .filter(d => !q || [d.numero, d.client.nom, d.chantier.objet, d.client.ville].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));
  const counts = s => state.devis.filter(d => s === 'tous' || d.statut === s).length;
  return `
  <div class="page-head">
    <div><h1>Mes devis</h1><p class="muted">${state.devis.length} devis au total</p></div>
    <button class="btn primary big" data-action="new-devis">${icon('plus')} Nouveau devis</button>
  </div>
  <div class="toolbar">
    <div class="chips">${['tous', 'brouillon', 'envoye', 'signe', 'refuse'].map(s => `<button class="chip ${listFilter === s ? 'on' : ''}" data-action="filter" data-f="${s}">${s === 'tous' ? 'Tous' : STATUTS[s].label} <b>${counts(s)}</b></button>`).join('')}</div>
    <input type="search" class="search" placeholder="Rechercher un client, un numéro…" value="${esc(listSearch)}" data-action-input="search">
  </div>
  ${rows.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Objet</th><th class="num">Total TTC</th><th>Statut</th></tr></thead>
    <tbody>${rows.map(d => `<tr data-action="open-devis" data-id="${d.id}" tabindex="0">
      <td class="mono">${esc(d.numero)}</td><td>${fmtDate(d.date)}</td><td><strong>${esc(d.client.nom || '—')}</strong></td>
      <td class="ell">${esc(d.chantier.objet || '—')}</td><td class="num">${fmtMoney(computeTotals(d).ttc)}</td><td>${statutBadge(d.statut)}</td></tr>`).join('')}</tbody>
  </table></div>` : `<div class="card"><p class="empty">${state.devis.length ? 'Aucun devis ne correspond.' : 'Aucun devis pour l\'instant. Créez le premier en 2 minutes.'}</p></div>`}`;
}

/* =========================================================
   Vue : éditeur de devis
   ========================================================= */
const field = (label, bind, val, o = {}) => `
  <label class="field ${o.cls || ''}"><span>${label}</span>
  ${o.textarea ? `<textarea data-bind="${bind}" rows="${o.rows || 3}" placeholder="${esc(o.ph || '')}">${esc(val)}</textarea>`
    : `<input type="${o.type || 'text'}" data-bind="${bind}" value="${esc(val)}" placeholder="${esc(o.ph || '')}" ${o.attrs || ''}>`}</label>`;

function lineRow(l) {
  const tot = parseNum(l.qte) * parseNum(l.pu);
  const franchise = state.profil.tvaRegime === 'franchise';
  const sansPrix = !l.estime && !parseNum(l.pu) && String(l.designation || '').trim();
  return `<div class="line ${l.estime || sansPrix ? 'estime' : ''}" data-line="${l.id}">
    <div class="l-des">
      <input class="l-designation" data-lf="designation" value="${esc(l.designation)}" placeholder="Désignation (ex. Pose carrelage sol)">
      <textarea data-lf="details" rows="1" placeholder="Précisions (optionnel)">${esc(l.details)}</textarea>
      ${l.estime ? `<div class="estime-note">${icon('info')} Prix proposé par l'IA : vérifiez-le avant d'envoyer.</div>` : ''}
      ${sansPrix ? `<div class="estime-note">${icon('info')} Prix à compléter. Astuce : l'icône ${icon('save')} l'enregistre pour les prochains devis.</div>` : ''}
    </div>
    <label class="l-num"><span>Qté</span><input data-lf="qte" inputmode="decimal" value="${esc(String(l.qte).replace('.', ','))}"></label>
    <label class="l-u"><span>Unité</span><select data-lf="unite">${[...new Set([...UNITES, l.unite || 'u'])].map(u => `<option ${u === l.unite ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
    <label class="l-num"><span>PU HT</span><input data-lf="pu" inputmode="decimal" value="${esc(String(l.pu).replace('.', ','))}"></label>
    ${franchise ? '' : `<label class="l-tva"><span>TVA</span><select data-lf="tva">${TVAS.map(t => `<option value="${t}" ${parseNum(l.tva) === t ? 'selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select></label>`}
    <div class="l-tot"><span>Total HT</span><strong data-ltot>${fmtMoney(tot)}</strong></div>
    <div class="l-act">
      <button class="icon-btn" title="Enregistrer dans ma bibliothèque" data-action="line-to-lib" data-id="${l.id}">${icon('save')}</button>
      <button class="icon-btn" title="Monter" data-action="line-up" data-id="${l.id}">${icon('up')}</button>
      <button class="icon-btn danger" title="Supprimer la ligne" data-action="del-line" data-id="${l.id}">${icon('trash')}</button>
    </div>
  </div>`;
}

const noLinesHTML = () => `<div class="empty" id="no-lines"><p>Aucune ligne pour l'instant. Décrivez le chantier ci-dessus, partez d'un modèle, ou ajoutez une ligne.</p><button class="btn" data-action="open-modeles">${icon('doc')} Choisir un modèle de devis</button></div>`;

function viewEditeur() {
  const dv = getDevis(currentId);
  const p = state.profil;
  const st = dv.statut;
  return `
  <div class="page-head editor-head">
    <div>
      <button class="back" data-action="nav" data-view="devis">${icon('back')} Mes devis</button>
      <h1>Devis <span class="mono">${esc(dv.numero)}</span> ${statutBadge(st)}</h1>
    </div>
    <div class="head-actions">
      <button class="btn" data-action="duplicate">${icon('copy')} Dupliquer</button>
      <button class="btn" data-action="save-modele">${icon('save')} Enregistrer comme modèle</button>
      <button class="btn primary" data-action="pdf">${icon('download')} Télécharger le PDF</button>
    </div>
  </div>

  <div class="status-bar">
    ${st === 'brouillon' ? `<span>${icon('send')} Une fois le devis envoyé au client, indiquez-le ici pour lancer le suivi des relances.</span><button class="btn primary" data-action="mark-sent">Marquer comme envoyé</button>` : ''}
    ${st === 'envoye' ? `<span>${icon('bell')} Envoyé le ${fmtDate(dv.dateEnvoi)} · ${dv.relances.length} relance(s) faite(s).</span><div class="row-gap"><button class="btn success" data-action="mark-signed">${icon('check')} Signé</button><button class="btn" data-action="mark-refused">Refusé</button><button class="btn ghost" data-action="mark-draft">Repasser en brouillon</button></div>` : ''}
    ${st === 'signe' ? `<span>${icon('check')} Devis signé, bravo ! 🎉</span><button class="btn ghost" data-action="mark-draft">Annuler le statut</button>` : ''}
    ${st === 'refuse' ? `<span>Devis refusé.</span><button class="btn ghost" data-action="mark-draft">Annuler le statut</button>` : ''}
  </div>

  <div class="editor">
    <div class="editor-form">
      <section class="card">
        <h2>${icon('user')} Client</h2>
        <div class="fgrid">
          ${field('Nom du client *', 'client.nom', dv.client.nom, { ph: 'M. et Mme Martin', cls: 'span2' })}
          ${field('Email', 'client.email', dv.client.email, { type: 'email', ph: 'client@email.fr' })}
          ${field('Téléphone', 'client.tel', dv.client.tel, { type: 'tel', ph: '06 12 34 56 78' })}
          ${field('Adresse', 'client.adresse', dv.client.adresse, { ph: '12 rue des Lilas', cls: 'span2' })}
          ${field('Code postal', 'client.cp', dv.client.cp, { ph: '69003', attrs: 'inputmode="numeric"' })}
          ${field('Ville', 'client.ville', dv.client.ville, { ph: 'Lyon' })}
        </div>
      </section>

      <section class="card">
        <h2>${icon('home')} Chantier</h2>
        <div class="fgrid">
          ${field('Objet du devis', 'chantier.objet', dv.chantier.objet, { ph: 'Rénovation salle de bain', cls: 'span2' })}
          ${field('Adresse du chantier (si différente)', 'chantier.adresse', dv.chantier.adresse, { cls: 'span2' })}
          ${field('Début des travaux prévu', 'chantier.dateDebut', dv.chantier.dateDebut, { type: 'date' })}
          ${field('Durée estimée', 'chantier.duree', dv.chantier.duree, { ph: '3 jours' })}
          ${field('Date du devis', 'date', dv.date, { type: 'date' })}
          ${field('Validité (jours)', 'validiteJours', dv.validiteJours, { attrs: 'inputmode="numeric"' })}
        </div>
      </section>

      <section class="card ai-card">
        <h2>${icon('spark')} <span data-ai>Décrivez le chantier, l'IA rédige les lignes</span><span data-noai>Décrivez le chantier, l'outil prépare les lignes</span></h2>
        <p class="muted small">Écrivez comme vous parlez, une prestation par ligne ou séparées par des virgules. Exemple : « Remplacement chauffe-eau 200 L, dépose de l'ancien, 3 h de main-d'œuvre, déplacement ». <span data-noai>Ou partez d'un modèle de votre métier.</span></p>
        <div class="ai-input">
          <textarea id="ai-desc" data-bind="description" rows="4" placeholder="Décrivez les travaux à réaliser…">${esc(dv.description)}</textarea>
          ${dictationAvailable() ? `<button class="btn mic" data-action="dictate">${icon('mic')}<span>Dicter</span></button>` : ''}
        </div>
        <div class="row-gap">
          <button class="btn primary" data-action="ai-lines">${icon('spark')} Générer les lignes du devis</button>
          <button class="btn" data-action="open-modeles">${icon('doc')} Partir d'un modèle</button>
          <span class="muted small">Vos prix enregistrés dans la bibliothèque sont utilisés en priorité.</span>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${icon('list')} Prestations</h2>
          <div class="row-gap">
            ${state.prestations.length ? `<select class="lib-select" data-action-change="add-from-lib"><option value="">+ Depuis ma bibliothèque…</option>${state.prestations.map(pr => `<option value="${pr.id}">${esc(pr.designation)} — ${fmtMoney(pr.prixHT)}/${esc(pr.unite)}</option>`).join('')}</select>` : ''}
          </div>
        </div>
        <div id="lines">${dv.lignes.map(lineRow).join('') || noLinesHTML()}</div>
        <button class="btn add-line" data-action="add-line">${icon('plus')} Ajouter une ligne</button>
        <div class="totals-row">
          <div class="fgrid small-grid">
            ${field('Remise (%)', 'remisePct', dv.remisePct, { attrs: 'inputmode="decimal"' })}
            ${field('Acompte à la signature (%)', 'acomptePct', dv.acomptePct, { attrs: 'inputmode="decimal"' })}
          </div>
          <div class="totals" id="totals"></div>
        </div>
      </section>

      <section class="card">
        <h2>${icon('pen')} Texte de présentation</h2>
        <p class="muted small">Quelques phrases en haut du devis qui reformulent le besoin et rassurent le client : c'est souvent ce qui fait signer.</p>
        <textarea data-bind="intro" rows="5" placeholder="Madame, Monsieur, suite à notre visite…">${esc(dv.intro)}</textarea>
        <div class="row-gap"><button class="btn" data-action="ai-intro">${icon('spark')} <span data-ai>Rédiger avec l'IA</span><span data-noai>${dv.intro ? 'Proposer une autre formulation' : 'Rédiger automatiquement'}</span></button></div>
      </section>

      <section class="card">
        <h2>${icon('note')} Conditions particulières</h2>
        <textarea data-bind="notes" rows="3" placeholder="Ex. : Matériaux fournis par le client. Accès au chantier à prévoir.">${esc(dv.notes)}</textarea>
        <p class="muted small">Validité, conditions de paiement, assurance et médiateur sont ajoutés automatiquement depuis <a href="#profil">votre profil</a>.</p>
      </section>

      <div class="danger-zone"><button class="btn ghost danger" data-action="delete-devis">${icon('trash')} Supprimer ce devis</button></div>
    </div>

    <aside class="editor-preview">
      <div class="preview-sticky">
        <div class="preview-label">Aperçu</div>
        <div class="paper" id="preview"></div>
        <button class="btn primary full" data-action="pdf">${icon('download')} Télécharger le PDF</button>
      </div>
    </aside>
  </div>`;
}

function previewHTML(dv) {
  const p = state.profil; const t = computeTotals(dv);
  const c = dv.client;
  const lignes = dv.lignes.filter(l => (l.designation || '').trim() || parseNum(l.pu));
  return `
  <div class="pv-head" style="--acc:${esc(p.couleur)}">
    <div class="pv-ent">
      ${p.logo ? `<img src="${esc(p.logo)}" alt="" class="pv-logo">` : ''}
      <strong>${esc(p.nom || 'Votre entreprise')}</strong>
      <small>${esc([p.adresse, [p.cp, p.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</small>
      ${p.siret ? `<small>SIRET ${esc(p.siret)}</small>` : '<small class="warn-text">SIRET manquant</small>'}
    </div>
    <div class="pv-title"><b>DEVIS</b><small>N° ${esc(dv.numero)}</small><small>Du ${fmtDate(dv.date)}</small></div>
  </div>
  <div class="pv-client"><em>CLIENT</em><strong>${esc(c.nom || 'Nom du client')}</strong><small>${esc([c.adresse, [c.cp, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</small></div>
  ${dv.chantier.objet ? `<div class="pv-objet">Objet : ${esc(dv.chantier.objet)}</div>` : ''}
  ${dv.intro ? `<p class="pv-intro">${esc(dv.intro).replace(/\n/g, '<br>')}</p>` : ''}
  <table class="pv-table" style="--acc:${esc(p.couleur)}"><thead><tr><th>Désignation</th><th>Qté</th><th>PU HT</th><th>Total HT</th></tr></thead>
  <tbody>${lignes.map(l => `<tr><td><b>${esc(l.designation)}</b>${l.details ? `<br><small>${esc(l.details)}</small>` : ''}</td><td>${fmtQty(l.qte)} ${esc(l.unite)}</td><td>${fmtMoney(l.pu)}</td><td>${fmtMoney(parseNum(l.qte) * parseNum(l.pu))}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">Aucune prestation</td></tr>`}</tbody></table>
  <div class="pv-totals" style="--acc:${esc(p.couleur)}">
    ${t.remiseMontant > 0 ? `<div><span>Remise</span><span>- ${fmtMoney(t.remiseMontant)}</span></div>` : ''}
    <div><span>Total HT</span><span>${fmtMoney(t.htNet)}</span></div>
    ${t.tvaLines.map(x => `<div><span>TVA ${String(x.rate).replace('.', ',')} %</span><span>${fmtMoney(x.montant)}</span></div>`).join('')}
    <div class="pv-ttc"><span>${t.franchise ? 'Net à payer' : 'Total TTC'}</span><span>${fmtMoney(t.ttc)}</span></div>
    ${t.acompte > 0 ? `<div><span>Acompte (${String(dv.acomptePct).replace('.', ',')} %)</span><span>${fmtMoney(t.acompte)}</span></div>` : ''}
  </div>
  <div class="pv-sign">Bon pour accord du client</div>`;
}

function totalsHTML(dv) {
  const t = computeTotals(dv);
  return `
    ${t.remiseMontant > 0 ? `<div><span>Total HT brut</span><span>${fmtMoney(t.brut)}</span></div><div><span>Remise</span><span>- ${fmtMoney(t.remiseMontant)}</span></div>` : ''}
    <div><span>Total HT</span><span>${fmtMoney(t.htNet)}</span></div>
    ${t.tvaLines.map(x => `<div><span>TVA ${String(x.rate).replace('.', ',')} %</span><span>${fmtMoney(x.montant)}</span></div>`).join('')}
    ${t.franchise ? `<div class="muted small"><span>TVA non applicable, art. 293 B du CGI</span></div>` : ''}
    <div class="ttc"><span>${t.franchise ? 'Net à payer' : 'Total TTC'}</span><span>${fmtMoney(t.ttc)}</span></div>
    ${t.acompte > 0 ? `<div><span>Acompte</span><span>${fmtMoney(t.acompte)}</span></div>` : ''}`;
}

function refreshDerived() {
  const dv = getDevis(currentId); if (!dv) return;
  const tot = $('#totals'); if (tot) tot.innerHTML = totalsHTML(dv);
  const pv = $('#preview'); if (pv) pv.innerHTML = previewHTML(dv);
}
function renderLines() {
  const dv = getDevis(currentId);
  $('#lines').innerHTML = dv.lignes.map(lineRow).join('') || noLinesHTML();
  autosizeAll();
  refreshDerived();
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 34) + 'px'; }
function autosizeAll() { $$('#lines textarea').forEach(autosize); }
function afterEditorRender() { autosizeAll(); refreshDerived(); initDictationClaude(); }

/* =========================================================
   Vue : relances
   ========================================================= */
function viewRelances() {
  const items = state.devis.map(d => ({ d, r: relanceInfo(d) })).filter(x => x.r)
    .sort((a, b) => (a.r.termine - b.r.termine) || String(a.r.due).localeCompare(String(b.r.due)));
  const tpl = state.profil.templates;
  return `
  <div class="page-head"><div><h1>Relances</h1><p class="muted">Les devis envoyés sans réponse. Relance prévue à J+${tpl.map(t => t.jours).join(', J+')} après l'envoi (modifiable dans <a href="#profil">Profil</a>).</p></div></div>
  ${items.length ? items.map(({ d, r }) => {
    const niveau = r.niveau;
    const t = niveau ? tpl[niveau - 1] : null;
    return `<section class="card relance ${r.enRetard ? 'due' : ''}">
      <div class="card-head">
        <div><h2>${esc(d.client.nom || 'Client sans nom')} <span class="muted mono small">${esc(d.numero)}</span></h2>
        <p class="muted small">${esc(d.chantier.objet || 'Sans objet')} · ${fmtMoney(computeTotals(d).ttc)} TTC · envoyé le ${fmtDate(d.dateEnvoi)}</p></div>
        ${r.termine ? `<span class="badge">3 relances faites</span>` : r.enRetard ? `<span class="badge st-warn">Relance ${niveau} à faire</span>` : `<span class="badge">Relance ${niveau} dans ${r.joursRestants} j</span>`}
      </div>
      ${t ? `
      <div class="tabs" data-tabs="${d.id}">
        <button class="tab on" data-action="relance-tab" data-id="${d.id}" data-k="email">Email</button>
        <button class="tab" data-action="relance-tab" data-id="${d.id}" data-k="sms">SMS</button>
      </div>
      <textarea class="relance-text" id="rt-${d.id}" data-kind="email" rows="9">${esc(fillTemplate(t.email, d))}</textarea>
      <div class="row-gap wrap">
        <button class="btn primary" data-action="relance-copy" data-id="${d.id}">${icon('copy')} Copier</button>
        ${d.client.email ? `<a class="btn" data-relance-mail="${d.id}" href="${mailtoLink(d, t.email)}">${icon('send')} Ouvrir dans ma messagerie</a>` : ''}
        ${d.client.tel ? `<a class="btn" data-relance-sms="${d.id}" href="${smsLink(d, t.sms)}">${icon('phone')} SMS</a>` : ''}
        <button class="btn" data-ai data-action="relance-ai" data-id="${d.id}" data-niveau="${niveau}">${icon('spark')} Personnaliser avec l'IA</button>
        <button class="btn success" data-action="relance-done" data-id="${d.id}">${icon('check')} Marquer la relance comme faite</button>
      </div>
      <p class="muted small">${d.client.email ? `Email : ${esc(d.client.email)}` : 'Pas d\'email client.'} ${d.client.tel ? ' · Tél. : ' + esc(d.client.tel) : ''}</p>` : ''}
      <div class="row-gap"><button class="btn ghost" data-action="open-devis" data-id="${d.id}">Ouvrir le devis</button><button class="btn ghost success-text" data-action="quick-signed" data-id="${d.id}">Le client a signé</button><button class="btn ghost" data-action="quick-refused" data-id="${d.id}">Le client a refusé</button></div>
    </section>`;
  }).join('') : `<div class="card"><p class="empty">Aucun devis en attente. Quand vous envoyez un devis, cliquez sur « Marquer comme envoyé » : il apparaîtra ici au moment de le relancer.</p></div>`}`;
}
function splitSubject(text) {
  const m = String(text).match(/^Objet\s*:\s*(.+)\n+/i);
  return m ? { subject: m[1].trim(), body: text.slice(m[0].length) } : { subject: '', body: text };
}
function mailtoLink(d, tplText, filled) {
  const { subject, body } = splitSubject(filled ?? fillTemplate(tplText, d));
  return `mailto:${encodeURIComponent(d.client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function smsLink(d, tplText, filled) {
  return `sms:${encodeURIComponent(String(d.client.tel).replace(/\s/g, ''))}?&body=${encodeURIComponent(filled ?? fillTemplate(tplText, d))}`;
}

/* =========================================================
   Vue : bibliothèque de prestations
   ========================================================= */
function viewPrestations() {
  const franchise = state.profil.tvaRegime === 'franchise';
  return `
  <div class="page-head"><div><h1>Ma bibliothèque</h1><p class="muted">Vos prestations et vos prix habituels. L'IA les utilise en priorité pour rédiger vos devis.</p></div>
  <button class="btn primary" data-action="add-presta">${icon('plus')} Ajouter une prestation</button></div>
  <div class="card">
  ${state.prestations.length ? `<div class="presta-list">${state.prestations.map(pr => `
    <div class="presta" data-presta="${pr.id}">
      <label class="field grow"><span>Désignation</span><input data-pf="designation" value="${esc(pr.designation)}"></label>
      <label class="field w-sm"><span>Unité</span><select data-pf="unite">${[...new Set([...UNITES, pr.unite])].map(u => `<option ${u === pr.unite ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
      <label class="field w-sm"><span>Prix HT (€)</span><input data-pf="prixHT" inputmode="decimal" value="${esc(String(pr.prixHT).replace('.', ','))}"></label>
      ${franchise ? '' : `<label class="field w-sm"><span>TVA</span><select data-pf="tva">${TVAS.map(t => `<option value="${t}" ${parseNum(pr.tva) === t ? 'selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select></label>`}
      <button class="icon-btn danger" data-action="del-presta" data-id="${pr.id}" title="Supprimer">${icon('trash')}</button>
    </div>`).join('')}</div>`
    : `<p class="empty">Votre bibliothèque est vide. Ajoutez vos prestations courantes (taux horaire, déplacement, poses au m²…), ou cliquez sur l'icône ${icon('save')} d'une ligne de devis pour l'enregistrer ici.</p>`}
  </div>`;
}

/* =========================================================
   Vue : profil
   ========================================================= */
const pfield = (label, key, o = {}) => {
  const v = state.profil[key] ?? '';
  return `<label class="field ${o.cls || ''}"><span>${label}</span>${o.textarea
    ? `<textarea data-pbind="${key}" rows="${o.rows || 3}" placeholder="${esc(o.ph || '')}">${esc(v)}</textarea>`
    : `<input type="${o.type || 'text'}" data-pbind="${key}" value="${esc(v)}" placeholder="${esc(o.ph || '')}" ${o.attrs || ''}>`}${o.help ? `<small>${o.help}</small>` : ''}</label>`;
};
function viewProfil() {
  const p = state.profil;
  return `
  <div class="page-head"><div><h1>Mon entreprise</h1><p class="muted">À remplir une seule fois : ces informations apparaissent sur tous vos devis.</p></div></div>
  <section class="card">
    <h2>${icon('building')} Identité</h2>
    <div class="fgrid">
      ${pfield('Nom de l\'entreprise *', 'nom', { ph: 'Dupont Plomberie', cls: 'span2' })}
      ${pfield('Métier', 'metier', { ph: 'Plombier-chauffagiste', help: 'Aide l\'IA à rédiger avec le bon vocabulaire.' })}
      ${pfield('Forme juridique', 'formeJuridique', { ph: 'EI, EURL, SARL, SAS…' })}
      ${pfield('Capital social (société)', 'capital', { ph: '5 000 €' })}
      ${pfield('SIRET *', 'siret', { ph: '123 456 789 00012', attrs: 'inputmode="numeric"' })}
      ${pfield('Immatriculation', 'rm', { ph: 'RNE / RM n° …', help: 'Ex. « Inscrit au RNE » ou n° RCS.' })}
      ${pfield('Adresse *', 'adresse', { cls: 'span2' })}
      ${pfield('Code postal', 'cp', { attrs: 'inputmode="numeric"' })}
      ${pfield('Ville', 'ville')}
      ${pfield('Téléphone *', 'tel', { type: 'tel' })}
      ${pfield('Email', 'email', { type: 'email' })}
    </div>
    <div class="logo-row">
      <div class="logo-box">${p.logo ? `<img src="${esc(p.logo)}" alt="Logo">` : `<span class="muted small">Pas de logo</span>`}</div>
      <div class="row-gap wrap">
        <label class="btn">${icon('image')} ${p.logo ? 'Changer le logo' : 'Ajouter un logo'}<input type="file" accept="image/png,image/jpeg" data-action-file="logo" hidden></label>
        ${p.logo ? `<button class="btn ghost" data-action="logo-remove">Retirer</button>` : ''}
        <label class="field inline"><span>Couleur des devis</span><input type="color" data-pbind="couleur" value="${esc(p.couleur)}"></label>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>${icon('euro')} TVA et paiement</h2>
    <div class="fgrid">
      <label class="field"><span>Régime de TVA</span><select data-pbind="tvaRegime">
        <option value="normal" ${p.tvaRegime === 'normal' ? 'selected' : ''}>Assujetti à la TVA</option>
        <option value="franchise" ${p.tvaRegime === 'franchise' ? 'selected' : ''}>Franchise en base (micro-entreprise, TVA non applicable)</option>
      </select></label>
      ${p.tvaRegime === 'franchise' ? '<div></div>' : `<label class="field"><span>Taux de TVA par défaut</span><select data-pbind="tvaDefaut">${TVAS.map(t => `<option value="${t}" ${parseNum(p.tvaDefaut) === t ? 'selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select><small>Le bon taux dépend des travaux et du logement : vérifiez-le avec votre comptable.</small></label>`}
      ${p.tvaRegime === 'franchise' ? '' : pfield('N° de TVA intracommunautaire', 'tvaNum', { ph: 'FR12 123456789', cls: 'span2' })}
      ${pfield('Conditions de paiement', 'conditionsPaiement', { textarea: true, rows: 2, cls: 'span2' })}
      ${pfield('Acompte par défaut (%)', 'acompteDefaut', { attrs: 'inputmode="decimal"' })}
      ${pfield('Validité des devis (jours)', 'validiteJours', { attrs: 'inputmode="numeric"' })}
      ${pfield('Préfixe de numérotation', 'prefixe', { ph: 'D' })}
      ${pfield('Prochain numéro', 'prochainNumero', { attrs: 'inputmode="numeric"', help: 'Les numéros doivent se suivre sans trou.' })}
    </div>
  </section>

  <section class="card">
    <h2>${icon('shield')} Assurance et mentions</h2>
    <div class="fgrid">
      ${pfield('Type d\'assurance', 'assuranceType', { ph: 'décennale' })}
      ${pfield('Assureur (nom et adresse)', 'assureur', { ph: 'MAAF Pro, 79036 Niort' })}
      ${pfield('N° de contrat', 'assuranceNum')}
      ${pfield('Couverture géographique', 'assuranceZone')}
      ${pfield('Médiateur de la consommation', 'mediateur', { cls: 'span2', ph: 'Nom, site web du médiateur', help: 'Obligatoire si vous travaillez pour des particuliers.' })}
      ${pfield('Autres mentions', 'mentionsSupp', { textarea: true, rows: 2, cls: 'span2', ph: 'Ex. pénalités de retard et indemnité forfaitaire de 40 € pour les clients professionnels.' })}
    </div>
    <p class="muted small">Les mentions obligatoires dépendent de votre statut et de votre métier : faites valider votre modèle de devis une fois par votre comptable.</p>
  </section>

  <section class="card">
    <h2>${icon('bell')} Modèles de relance</h2>
    <p class="muted small">Variables disponibles : {client} {numero} {objet} {montant} {date_envoi} {validite} {artisan} {tel} {email}</p>
    ${p.templates.map((t, i) => `
      <div class="tpl">
        <div class="tpl-head"><strong>Relance ${i + 1}</strong><label class="field inline"><span>Jours après l'envoi</span><input data-tpl="${i}" data-tk="jours" inputmode="numeric" value="${esc(t.jours)}"></label></div>
        <label class="field"><span>Email</span><textarea data-tpl="${i}" data-tk="email" rows="6">${esc(t.email)}</textarea></label>
        <label class="field"><span>SMS</span><textarea data-tpl="${i}" data-tk="sms" rows="2">${esc(t.sms)}</textarea></label>
      </div>`).join('')}
    <button class="btn ghost" data-action="reset-templates">Rétablir les modèles d'origine</button>
  </section>

  <section class="card">
    <h2>${icon('doc')} Mes modèles de devis</h2>
    ${state.modeles.length ? `<ul class="list">${state.modeles.map(m => `<li class="modele-row"><div><strong>${esc(m.nom)}</strong><span class="muted small"> · ${m.lignes.length} lignes</span></div><button class="icon-btn danger" data-action="del-modele" data-id="${m.id}" title="Supprimer ce modèle">${icon('trash')}</button></li>`).join('')}</ul>`
      : `<p class="muted small">Aucun modèle personnel. Dans un devis, cliquez sur « Enregistrer comme modèle » pour réutiliser ses lignes et ses prix.</p>`}
  </section>

  <section class="card">
    <h2>${icon('save')} Sauvegarde</h2>
    <p class="muted small">Vos données sont enregistrées sur cet appareil, dans ce navigateur. Exportez une sauvegarde régulièrement, ou pour passer sur un autre appareil.</p>
    <div class="row-gap wrap">
      <button class="btn" data-action="export">${icon('download')} Exporter mes données</button>
      <label class="btn">${icon('upload')} Importer une sauvegarde<input type="file" accept="application/json,.json" data-action-file="import" hidden></label>
      <button class="btn ghost danger" data-action="reset-all">Tout effacer</button>
    </div>
  </section>`;
}

/* =========================================================
   Données d'exemple
   ========================================================= */
function loadDemo() {
  const s = defaultState();
  Object.assign(s.profil, {
    nom: 'Dupont Plomberie', metier: 'Plombier-chauffagiste', formeJuridique: 'EURL', capital: '5 000 €',
    adresse: '14 rue Paul Bert', cp: '69003', ville: 'Lyon', tel: '06 12 34 56 78', email: 'contact@dupont-plomberie.fr',
    siret: '123 456 789 00012', rm: 'Inscrit au RNE', tvaNum: 'FR12 123456789', tvaDefaut: 10,
    assureur: 'Assureur Exemple, 1 avenue de l\'Exemple, 75000 Paris', assuranceNum: 'DEC-000123', mediateur: 'Médiateur Exemple — www.mediateur-exemple.fr',
    couleur: '#1e40af', prochainNumero: 1,
  });
  s.prestations = [
    { id: uid(), designation: 'Main-d\'œuvre plombier', unite: 'h', prixHT: 55, tva: 10 },
    { id: uid(), designation: 'Déplacement', unite: 'forfait', prixHT: 35, tva: 10 },
    { id: uid(), designation: 'Chauffe-eau électrique 200 L (fourniture)', unite: 'u', prixHT: 520, tva: 10 },
    { id: uid(), designation: 'Dépose et évacuation ancien chauffe-eau', unite: 'forfait', prixHT: 90, tva: 10 },
    { id: uid(), designation: 'Groupe de sécurité', unite: 'u', prixHT: 45, tva: 10 },
    { id: uid(), designation: 'Recherche de fuite', unite: 'forfait', prixHT: 150, tva: 10 },
  ];
  const prev = state; state = s;
  const mk = (o, lignes) => { const d = createDevis(); Object.assign(d, o); d.lignes = lignes.map(l => newLigne(l)); return d; };
  const today = isoLocal();
  mk({ statut: 'signe', date: addDays(today, -20), dateEnvoi: addDays(today, -20), client: { nom: 'Mme Bernard', email: 'bernard@exemple.fr', tel: '06 00 00 00 01', adresse: '3 place Bellecour', cp: '69002', ville: 'Lyon' }, chantier: { objet: 'Recherche et réparation de fuite', adresse: '', dateDebut: '', duree: '1 jour' } },
    [{ designation: 'Recherche de fuite', unite: 'forfait', qte: 1, pu: 150 }, { designation: 'Main-d\'œuvre plombier', unite: 'h', qte: 2, pu: 55 }, { designation: 'Déplacement', unite: 'forfait', qte: 1, pu: 35 }]);
  mk({ statut: 'envoye', date: addDays(today, -4), dateEnvoi: addDays(today, -4), client: { nom: 'M. et Mme Martin', email: 'martin@exemple.fr', tel: '06 00 00 00 02', adresse: '12 rue des Lilas', cp: '69003', ville: 'Lyon' },
    chantier: { objet: 'Remplacement du chauffe-eau', adresse: '', dateDebut: addDays(today, 10), duree: '1 jour' },
    intro: 'Madame, Monsieur,\n\nSuite à notre visite, vous trouverez ci-dessous notre proposition pour le remplacement de votre chauffe-eau. L\'intervention comprend la dépose de l\'ancien appareil, la pose et le raccordement d\'un chauffe-eau neuf de 200 litres, ainsi que la mise en service. Nous laissons le chantier propre à notre départ.\n\nN\'hésitez pas à nous contacter pour toute question ; il vous suffit de nous retourner ce devis signé pour réserver votre date.' },
    [{ designation: 'Chauffe-eau électrique 200 L (fourniture)', unite: 'u', qte: 1, pu: 520, details: 'Classe énergétique C, garantie fabricant 5 ans' }, { designation: 'Dépose et évacuation ancien chauffe-eau', unite: 'forfait', qte: 1, pu: 90 }, { designation: 'Groupe de sécurité', unite: 'u', qte: 1, pu: 45 }, { designation: 'Main-d\'œuvre plombier', unite: 'h', qte: 3, pu: 55 }, { designation: 'Déplacement', unite: 'forfait', qte: 1, pu: 35 }]);
  mk({ statut: 'brouillon', client: { nom: 'SCI Les Tilleuls', email: '', tel: '', adresse: '', cp: '', ville: 'Villeurbanne' }, chantier: { objet: 'Remplacement robinetterie cuisine', adresse: '', dateDebut: '', duree: '' } },
    [{ designation: 'Mitigeur évier (fourniture)', unite: 'u', qte: 1, pu: 89, estime: true }, { designation: 'Main-d\'œuvre plombier', unite: 'h', qte: 1, pu: 55 }]);
  s.devis.reverse();
  state = s; void prev;
  save();
}

/* =========================================================
   Actions
   ========================================================= */
let busy = false;
async function withBusy(btn, label, fn) {
  if (busy) return; busy = true;
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${label}`; }
  try { await fn(); } finally { busy = false; if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = old; } }
}

const actions = {
  'nav': el => go(el.dataset.view),
  'new-devis': () => { const d = createDevis(); go('editeur', d.id); },
  'open-devis': el => go('editeur', el.dataset.id),
  'filter': el => { listFilter = el.dataset.f; render(); },
  'load-demo': () => { loadDemo(); toast('Exemple chargé : modifiez le profil à votre nom quand vous voulez.'); render(); },

  'add-line': () => {
    const dv = getDevis(currentId); dv.lignes.push(newLigne()); touch(dv); renderLines();
    const last = $$('#lines .line').pop(); if (last) last.querySelector('input').focus();
  },
  'del-line': el => { const dv = getDevis(currentId); dv.lignes = dv.lignes.filter(l => l.id !== el.dataset.id); touch(dv); renderLines(); },
  'line-up': el => {
    const dv = getDevis(currentId); const i = dv.lignes.findIndex(l => l.id === el.dataset.id);
    if (i > 0) { [dv.lignes[i - 1], dv.lignes[i]] = [dv.lignes[i], dv.lignes[i - 1]]; touch(dv); renderLines(); }
  },
  'line-to-lib': el => {
    const dv = getDevis(currentId); const l = dv.lignes.find(x => x.id === el.dataset.id);
    if (!l || !l.designation.trim()) { toast('Donnez d\'abord une désignation à la ligne.', 'warn'); return; }
    const ex = state.prestations.find(p => p.designation.trim().toLowerCase() === l.designation.trim().toLowerCase());
    if (ex) Object.assign(ex, { unite: l.unite, prixHT: parseNum(l.pu), tva: parseNum(l.tva) });
    else state.prestations.push({ id: uid(), designation: l.designation.trim(), unite: l.unite, prixHT: parseNum(l.pu), tva: parseNum(l.tva) });
    l.estime = false; touch(dv); renderLines();
    toast(ex ? 'Prix mis à jour dans votre bibliothèque' : 'Ajouté à votre bibliothèque');
  },

  'dictate': el => toggleDictation(el, $('#ai-desc')),
  'ai-lines': el => withBusy(el, aiOn ? 'L\'IA rédige…' : 'Préparation…', async () => {
    const dv = getDevis(currentId);
    if (!dv.description.trim()) { toast('Décrivez d\'abord le chantier (ou dictez-le).', 'warn'); $('#ai-desc').focus(); return; }
    if (dict.active) toggleDictation(dict.btn, dict.target);
    let lignes = [], objet = '', viaAI = aiOn;
    if (!aiOn) {
      lignes = localParse(dv.description);
    } else try {
      const txt = await askAI('lignes', { description: dv.description, metier: state.profil.metier, bibliotheque: state.prestations });
      const data = parseJSON(txt);
      if (!data || !Array.isArray(data.lignes)) throw new AIError('Réponse de l\'IA illisible.', 'parse');
      objet = String(data.objet || '').slice(0, 150);
      lignes = data.lignes.slice(0, 60).map(x => newLigne({
        designation: String(x.designation || '').slice(0, 200), details: String(x.details || '').slice(0, 300),
        qte: parseNum(x.qte) || 1, unite: UNITES.includes(x.unite) ? x.unite : (String(x.unite || 'u').slice(0, 10) || 'u'),
        pu: r2(parseNum(x.pu)), estime: !!x.estime,
      }));
      // les prix de la bibliothèque priment toujours
      for (const l of lignes) {
        const hit = findLib(l.designation);
        if (hit) Object.assign(l, { pu: parseNum(hit.prixHT), unite: hit.unite, tva: parseNum(hit.tva), estime: false });
      }
    } catch (e) {
      viaAI = false;
      lignes = localParse(dv.description);
      toast(`${e.message || 'IA indisponible.'} Lignes préparées sans IA : complétez les prix.`, 'warn', 6000);
    }
    if (!lignes.length) { toast('Aucune ligne trouvée : précisez la description.', 'warn'); return; }
    const hasReal = dv.lignes.some(l => l.designation.trim());
    if (hasReal) {
      const choice = await modal(`<h3>Ajouter ${lignes.length} ligne(s)</h3><p class="modal-msg">Votre devis contient déjà des lignes. Que voulez-vous faire ?</p>
        <div class="modal-actions"><button class="btn" data-close="">Annuler</button><button class="btn" data-close="replace">Remplacer</button><button class="btn primary" data-close="append">Ajouter à la suite</button></div>`);
      if (!choice) return;
      dv.lignes = choice === 'replace' ? lignes : dv.lignes.concat(lignes);
    } else dv.lignes = lignes;
    if (objet && !dv.chantier.objet) { dv.chantier.objet = objet; const inp = $('[data-bind="chantier.objet"]'); if (inp) inp.value = objet; }
    touch(dv); renderLines();
    if (viaAI) toast(lignes.some(l => l.estime) ? 'Lignes créées. Les prix surlignés sont des estimations : vérifiez-les.' : 'Lignes créées avec vos prix.', 'ok', 5000);
    else if (!aiOn) toast(lignes.some(l => !parseNum(l.pu)) ? `${lignes.length} ligne(s) préparée(s) : complétez les prix surlignés.` : `${lignes.length} ligne(s) préparée(s) avec vos prix.`, 'ok', 5000);
    $('#lines').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }),
  'ai-intro': el => aiOn ? actions['ai-intro-ia'](el) : actions['ai-intro-auto'](el),
  'ai-intro-auto': el => {
    const dv = getDevis(currentId);
    if (!dv.lignes.length && !dv.chantier.objet && !dv.description) { toast('Indiquez au moins l\'objet ou les prestations du chantier.', 'warn'); return; }
    {
      dv.introVariante = dv.intro ? ((dv.introVariante || 0) + 1) % 3 : 0;
      dv.intro = texteIntro({ client: dv.client.nom, objet: dv.chantier.objet || dv.description.slice(0, 120), lignes: dv.lignes, dateDebut: dv.chantier.dateDebut ? fmtDate(dv.chantier.dateDebut) : '', duree: dv.chantier.duree }, dv.introVariante);
      touch(dv);
      const ta = $('[data-bind="intro"]'); if (ta) ta.value = dv.intro;
      const lab = el.querySelector('[data-noai]'); if (lab) lab.textContent = 'Proposer une autre formulation';
      refreshDerived(); toast('Texte rédigé. Personnalisez-le si besoin.');
    }
  },
  'ai-intro-ia': el => withBusy(el, 'Rédaction…', async () => {
    const dv = getDevis(currentId);
    if (!dv.lignes.length && !dv.chantier.objet && !dv.description) { toast('Indiquez au moins l\'objet ou les prestations du chantier.', 'warn'); return; }
    try {
      const txt = await askAI('intro', {
        entreprise: state.profil.nom, metier: state.profil.metier, client: dv.client.nom, objet: dv.chantier.objet || dv.description.slice(0, 200),
        dateDebut: dv.chantier.dateDebut ? fmtDate(dv.chantier.dateDebut) : '', duree: dv.chantier.duree, lignes: dv.lignes,
      });
      dv.intro = txt.trim(); touch(dv);
      const ta = $('[data-bind="intro"]'); if (ta) ta.value = dv.intro;
      refreshDerived(); toast('Texte rédigé. Relisez-le et ajustez si besoin.');
    } catch (e) { toast(e.message || 'IA indisponible.', 'warn', 6000); }
  }),

  'pdf': el => withBusy(el, 'Création du PDF…', async () => {
    const dv = getDevis(currentId);
    const missing = [];
    if (!state.profil.nom) missing.push('le nom de votre entreprise');
    if (!state.profil.siret) missing.push('votre SIRET');
    if (!dv.client.nom) missing.push('le nom du client');
    if (missing.length && !(await confirmBox(`Il manque ${missing.join(', ')}. Télécharger quand même ?`, 'Télécharger'))) return;
    if (dv.lignes.some(l => l.estime) && !(await confirmBox('Certains prix sont des estimations de l\'IA (surlignés). Les avez-vous vérifiés ?', 'Oui, télécharger'))) return;
    const sansPrix = dv.lignes.filter(l => String(l.designation || '').trim() && !parseNum(l.pu)).length;
    if (sansPrix && !(await confirmBox(`${sansPrix} ligne(s) n'ont pas de prix (surlignées). Télécharger quand même ?`, 'Télécharger'))) return;
    try {
      const bytes = await generatePDF(dv, state.profil, computeTotals(dv), fmt);
      const name = `Devis ${dv.numero}${dv.client.nom ? ' - ' + dv.client.nom : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '');
      const ok = await saveFile(name, bytes, 'application/pdf');
      if (ok && dv.statut === 'brouillon') toast('PDF prêt. Une fois envoyé au client, cliquez sur « Marquer comme envoyé ».', 'ok', 6000);
    } catch (e) { console.error(e); toast('Le PDF n\'a pas pu être créé.', 'err'); }
  }),
  'mark-sent': () => {
    const dv = getDevis(currentId);
    if (!dv.client.nom) { toast('Indiquez le nom du client avant.', 'warn'); return; }
    dv.statut = 'envoye'; dv.dateEnvoi = isoLocal(); dv.relances = []; touch(dv); render();
    toast(`Suivi activé : première relance prévue le ${fmtDate(addDays(dv.dateEnvoi, state.profil.templates[0].jours))}.`, 'ok', 5000);
  },
  'mark-signed': () => { const dv = getDevis(currentId); dv.statut = 'signe'; dv.dateSignature = isoLocal(); touch(dv); render(); toast('Bravo, devis signé ! 🎉'); },
  'mark-refused': () => { const dv = getDevis(currentId); dv.statut = 'refuse'; touch(dv); render(); },
  'mark-draft': () => { const dv = getDevis(currentId); dv.statut = 'brouillon'; dv.dateEnvoi = null; dv.relances = []; touch(dv); render(); },
  'quick-signed': el => { const dv = getDevis(el.dataset.id); dv.statut = 'signe'; touch(dv); render(); toast('Bravo, devis signé ! 🎉'); },
  'quick-refused': el => { const dv = getDevis(el.dataset.id); dv.statut = 'refuse'; touch(dv); render(); },
  'duplicate': () => {
    const src = getDevis(currentId);
    const d = createDevis();
    Object.assign(d, JSON.parse(JSON.stringify({ client: src.client, chantier: src.chantier, description: src.description, intro: src.intro, notes: src.notes, remisePct: src.remisePct, acomptePct: src.acomptePct })));
    d.lignes = src.lignes.map(l => ({ ...l, id: uid() }));
    touch(d); go('editeur', d.id); toast(`Copie créée : ${d.numero}`);
  },
  'delete-devis': async () => {
    const dv = getDevis(currentId);
    if (!(await confirmBox(`Supprimer définitivement le devis ${dv.numero} ?`, 'Supprimer', true))) return;
    state.devis = state.devis.filter(d => d.id !== dv.id); save(); go('devis'); toast('Devis supprimé');
  },

  'relance-tab': el => {
    const d = getDevis(el.dataset.id); const r = relanceInfo(d); if (!r?.niveau) return;
    const t = state.profil.templates[r.niveau - 1];
    const ta = $('#rt-' + d.id); ta.dataset.kind = el.dataset.k;
    ta.value = fillTemplate(el.dataset.k === 'sms' ? t.sms : t.email, d);
    ta.rows = el.dataset.k === 'sms' ? 4 : 9;
    $$(`[data-tabs="${d.id}"] .tab`).forEach(b => b.classList.toggle('on', b === el));
    updateRelanceLinks(d.id);
  },
  'relance-copy': el => { const ta = $('#rt-' + el.dataset.id); copyText(ta.dataset.kind === 'email' ? ta.value : ta.value); },
  'relance-ai': el => withBusy(el, 'Rédaction…', async () => {
    const d = getDevis(el.dataset.id); const ta = $('#rt-' + d.id);
    try {
      const txt = await askAI('relance', {
        niveau: el.dataset.niveau, canal: ta.dataset.kind, artisan: state.profil.nom, tel: state.profil.tel, client: d.client.nom,
        numero: d.numero, dateEnvoi: fmtDate(d.dateEnvoi), objet: d.chantier.objet, montant: fmtMoney(computeTotals(d).ttc), validite: fmtDate(validiteDate(d)),
      });
      ta.value = txt.trim(); updateRelanceLinks(d.id);
    } catch (e) { toast(e.message || 'IA indisponible.', 'warn', 6000); }
  }),
  'relance-done': el => {
    const d = getDevis(el.dataset.id); const ta = $('#rt-' + d.id);
    d.relances.push({ date: isoLocal(), canal: ta?.dataset.kind || 'email' }); touch(d); render();
    const r = relanceInfo(d);
    toast(r?.niveau ? `Relance notée. Prochaine relance le ${fmtDate(r.due)}.` : 'Relance notée. C\'était la dernière prévue.');
  },

  'open-modeles': async () => {
    const perso = state.modeles;
    const metierUser = normTxt(state.profil.metier);
    const groupes = MODELES.slice().sort((a, b) => (metierUser && metierUser.includes(normTxt(b.metier).slice(0, 5)) ? 1 : 0) - (metierUser && metierUser.includes(normTxt(a.metier).slice(0, 5)) ? 1 : 0));
    const btn = (key, nom, sub) => `<button class="tpl-pick" data-close="${key}"><strong>${esc(nom)}</strong><span>${esc(sub)}</span></button>`;
    const html = `<h3>Partir d'un modèle</h3>
      <p class="modal-msg small">Les lignes sont ajoutées au devis. Les prix viennent de votre bibliothèque quand une prestation porte le même nom ; sinon, complétez-les.</p>
      <div class="tpl-list">
        ${perso.length ? `<div class="tpl-group"><h4>Mes modèles</h4>${perso.map(m => btn('p:' + m.id, m.nom, `${m.lignes.length} lignes · avec vos prix`)).join('')}</div>` : ''}
        ${groupes.map((g) => `<div class="tpl-group"><h4>${esc(g.metier)}</h4>${g.items.map(it => btn('m:' + MODELES.indexOf(g) + ':' + g.items.indexOf(it), it.nom, `${it.lignes.length} lignes`)).join('')}</div>`).join('')}
      </div>
      <div class="modal-actions"><button class="btn" data-close="">Fermer</button></div>`;
    const choice = await modal(html, { wide: true });
    if (!choice) return;
    let m;
    if (choice.startsWith('p:')) {
      const pm = perso.find(x => x.id === choice.slice(2)); if (!pm) return;
      m = { objet: pm.objet, duree: pm.duree, lignes: pm.lignes.map(l => ligneDepuisModele(l.designation, l.details, l.qte, l.unite, l.pu, l.tva)) };
    } else {
      const [, gi, ii] = choice.split(':'); const it = MODELES[+gi].items[+ii];
      m = { objet: it.objet, duree: it.duree, lignes: it.lignes.map(([d, det, q, u]) => ligneDepuisModele(d, det, q, u, 0)) };
    }
    const dv = getDevis(currentId);
    if (dv.lignes.some(l => l.designation.trim())) {
      const c = await modal(`<h3>Ajouter ${m.lignes.length} ligne(s)</h3><p class="modal-msg">Votre devis contient déjà des lignes. Que voulez-vous faire ?</p>
        <div class="modal-actions"><button class="btn" data-close="">Annuler</button><button class="btn" data-close="replace">Remplacer</button><button class="btn primary" data-close="append">Ajouter à la suite</button></div>`);
      if (!c) return;
      dv.lignes = c === 'replace' ? m.lignes : dv.lignes.concat(m.lignes);
    } else dv.lignes = m.lignes;
    if (!dv.chantier.objet && m.objet) { dv.chantier.objet = m.objet; const i = $('[data-bind="chantier.objet"]'); if (i) i.value = m.objet; }
    if (!dv.chantier.duree && m.duree) { dv.chantier.duree = m.duree; const i = $('[data-bind="chantier.duree"]'); if (i) i.value = m.duree; }
    touch(dv); renderLines();
    const manquants = dv.lignes.filter(l => !parseNum(l.pu)).length;
    toast(manquants ? `Modèle ajouté. Complétez les ${manquants} prix surlignés et ajustez les quantités.` : 'Modèle ajouté avec vos prix. Ajustez les quantités.', 'ok', 5000);
    $('#lines').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'save-modele': async () => {
    const dv = getDevis(currentId);
    const lignes = dv.lignes.filter(l => l.designation.trim());
    if (!lignes.length) { toast('Ajoutez d\'abord des lignes au devis.', 'warn'); return; }
    window.__lastModeleNom = dv.chantier.objet || 'Mon modèle';
    const res = await modal(`<h3>Enregistrer comme modèle</h3><p class="modal-msg small">Vous pourrez réutiliser ces ${lignes.length} lignes, avec leurs prix, pour vos prochains devis.</p>
      <label class="field"><span>Nom du modèle</span><input id="modele-nom" value="${esc(dv.chantier.objet || 'Mon modèle')}"></label>
      <div class="modal-actions" style="margin-top:16px"><button class="btn" data-close="">Annuler</button><button class="btn primary" data-close="ok">Enregistrer</button></div>`);
    if (res !== 'ok') return;
    const nom = (window.__lastModeleNom || dv.chantier.objet || 'Mon modèle').trim();
    state.modeles.unshift({ id: uid(), nom, objet: dv.chantier.objet, duree: dv.chantier.duree, lignes: lignes.map(l => ({ designation: l.designation, details: l.details, qte: parseNum(l.qte), unite: l.unite, pu: parseNum(l.pu), tva: parseNum(l.tva) })) });
    save(); toast(`Modèle « ${nom} » enregistré.`);
  },
  'del-modele': el => { state.modeles = state.modeles.filter(m => m.id !== el.dataset.id); save(); render(); },
  'add-presta': () => { state.prestations.unshift({ id: uid(), designation: '', unite: 'u', prixHT: 0, tva: state.profil.tvaDefaut ?? 10 }); save(); render(); const i = $('.presta input'); if (i) i.focus(); },
  'del-presta': el => { state.prestations = state.prestations.filter(p => p.id !== el.dataset.id); save(); render(); },

  'logo-remove': () => { state.profil.logo = ''; save(); render(); },
  'reset-templates': async () => { if (await confirmBox('Rétablir les 3 modèles de relance d\'origine ?')) { state.profil.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)); save(); render(); } },
  'export': async () => {
    const ok = await saveFile(`devisexpress-sauvegarde-${isoLocal()}.json`, new TextEncoder().encode(JSON.stringify(state, null, 1)), 'application/json').catch(() => false);
    if (ok) toast('Sauvegarde exportée');
  },
  'reset-all': async () => {
    if (!(await confirmBox('Effacer TOUTES vos données (profil, devis, bibliothèque) sur cet appareil ? Exportez une sauvegarde avant si besoin.', 'Tout effacer', true))) return;
    state = defaultState(); save(); go('tableau'); toast('Données effacées');
  },
};

function updateRelanceLinks(id) {
  const d = getDevis(id); const ta = $('#rt-' + id); if (!ta) return;
  const mail = $(`[data-relance-mail="${id}"]`); const sms = $(`[data-relance-sms="${id}"]`);
  if (ta.dataset.kind === 'email') { if (mail) mail.href = mailtoLink(d, null, ta.value); if (sms) sms.href = smsLink(d, null, ta.value); }
  else { if (sms) sms.href = smsLink(d, null, ta.value); if (mail) mail.href = mailtoLink(d, null, ta.value); }
}

/* =========================================================
   Événements
   ========================================================= */
function onClick(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (fn) { ev.preventDefault(); fn(el, ev); }
}
function onInput(ev) {
  const el = ev.target;
  if (el.matches('textarea')) { if (el.closest('#lines')) autosize(el); }
  if (el.id === 'modele-nom') { window.__lastModeleNom = el.value; return; }
  if (el.dataset.actionInput === 'search') {
    listSearch = el.value; const pos = el.selectionStart; render();
    const s = $('.search'); if (s) { s.focus(); s.setSelectionRange(pos, pos); }
    return;
  }
  // éditeur de devis
  if (el.dataset.bind) {
    const dv = getDevis(currentId); if (!dv) return;
    const numeric = ['remisePct', 'acomptePct', 'validiteJours'].includes(el.dataset.bind);
    setPath(dv, el.dataset.bind, numeric ? parseNum(el.value) : el.value);
    touch(dv); refreshDerived(); return;
  }
  if (el.dataset.lf) {
    const dv = getDevis(currentId); const row = el.closest('[data-line]');
    const l = dv.lignes.find(x => x.id === row.dataset.line); if (!l) return;
    const k = el.dataset.lf;
    l[k] = ['qte', 'pu', 'tva'].includes(k) ? parseNum(el.value) : el.value;
    if (k === 'pu' && l.estime) { l.estime = false; row.classList.remove('estime'); const n = row.querySelector('.estime-note'); if (n) n.remove(); }
    row.querySelector('[data-ltot]').textContent = fmtMoney(parseNum(l.qte) * parseNum(l.pu));
    touch(dv); refreshDerived(); return;
  }
  // profil
  if (el.dataset.pbind) {
    const k = el.dataset.pbind;
    const numeric = ['tvaDefaut', 'acompteDefaut', 'validiteJours', 'prochainNumero'].includes(k);
    state.profil[k] = numeric ? parseNum(el.value) : el.value;
    save();
    if (k === 'tvaRegime' && ev.type === 'change') render();
    return;
  }
  if (el.dataset.tpl !== undefined) {
    const t = state.profil.templates[+el.dataset.tpl];
    t[el.dataset.tk] = el.dataset.tk === 'jours' ? Math.max(1, parseNum(el.value)) : el.value;
    save(); return;
  }
  if (el.dataset.pf) {
    const pr = state.prestations.find(p => p.id === el.closest('[data-presta]').dataset.presta); if (!pr) return;
    pr[el.dataset.pf] = ['prixHT', 'tva'].includes(el.dataset.pf) ? parseNum(el.value) : el.value;
    save(); return;
  }
  if (el.classList.contains('relance-text')) updateRelanceLinks(el.id.replace('rt-', ''));
}
function onChange(ev) {
  const el = ev.target;
  if (el.dataset.actionChange === 'add-from-lib') {
    const pr = state.prestations.find(p => p.id === el.value); el.value = '';
    if (!pr) return;
    const dv = getDevis(currentId);
    dv.lignes.push(newLigne({ designation: pr.designation, unite: pr.unite, pu: parseNum(pr.prixHT), tva: parseNum(pr.tva) }));
    touch(dv); renderLines(); return;
  }
  if (el.dataset.actionFile === 'logo') return handleLogo(el);
  if (el.dataset.actionFile === 'import') return handleImport(el);
  if (el.tagName === 'SELECT' || el.type === 'color' || el.type === 'date') onInput(ev);
}
function handleLogo(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const max = 480; const sc = Math.min(max / img.width, max / img.height, 1);
    const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    state.profil.logo = cv.toDataURL('image/png'); URL.revokeObjectURL(url); save(); render(); toast('Logo ajouté');
  };
  img.onerror = () => toast('Image illisible. Utilisez un PNG ou un JPG.', 'err');
  img.src = url;
}
function handleImport(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !data.profil || !Array.isArray(data.devis)) throw new Error('format');
      if (!(await confirmBox(`Remplacer les données actuelles par cette sauvegarde (${data.devis.length} devis) ?`, 'Importer'))) return;
      state = migrate(data); save(); render(); toast('Sauvegarde importée');
    } catch (e) { toast('Fichier de sauvegarde invalide.', 'err'); }
  };
  reader.readAsText(file);
}

document.addEventListener('click', onClick);
document.addEventListener('input', onInput);
document.addEventListener('change', onChange);
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.matches('tr[data-action]')) onClick(ev);
  if (ev.key === 'Escape' && !$('#modal').hidden) $('#modal')._close?.(null);
});
window.addEventListener('hashchange', render);

setAI(false);
render();
detectAI();
if (!storageOk) setTimeout(() => toast("Ce navigateur n'enregistre pas les données : exportez une sauvegarde avant de fermer.", 'warn', 7000), 800);

// pour les tests automatisés
window.__devisexpress = { get state() { return state; }, computeTotals, localParse, fillTemplate, relanceInfo };
