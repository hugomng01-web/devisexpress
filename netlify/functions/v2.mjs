import { createHash, createHmac, randomBytes } from 'node:crypto';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const profiles = ['professionnel', 'beta', 'non_renseigne'];
const events = ['visite', 'activite', 'devis', 'devis_professionnel', 'pdf', 'relance', 'ia'];
const setting = key => process.env[key] || '';
const ready = () => Boolean(setting('SUPABASE_URL') && setting('SUPABASE_PUBLISHABLE_KEY') && setting('SUPABASE_SERVICE_ROLE_KEY') && setting('DX_HASH_SECRET').length >= 32);
const hash = value => createHmac('sha256', setting('DX_HASH_SECRET')).update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const originOf = req => setting('ALLOWED_ORIGIN') || new URL(req.url).origin;

function cookie(name, value, age, req) {
  const secure = new URL(req.url).protocol === 'https:' || originOf(req).startsWith('https:');
  return `dx_${name}=${encodeURIComponent(value)}; Path=/api/v2; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
}
function cookies(req) {
  return Object.fromEntries((req.headers.get('cookie') || '').split(';').map(pair => pair.trim().split('=')).filter(pair => pair.length === 2));
}
function output(data, session, req, status = 200) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
  if (session) {
    headers.append('Set-Cookie', cookie('access', session.access_token || '', session.access_token ? (session.expires_in || 3600) : 0, req));
    headers.append('Set-Cookie', cookie('refresh', session.refresh_token || '', session.refresh_token ? 2592000 : 0, req));
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function supa(path, { method = 'GET', data, token, service = false, prefer } = {}) {
  const key = setting(service ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_PUBLISHABLE_KEY');
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (token || service) headers.Authorization = `Bearer ${token || key}`;
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(setting('SUPABASE_URL').replace(/\/$/, '') + path, {
    method, headers, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(8000),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw fail(response.status, value?.msg || value?.message || 'Service indisponible.');
  return value;
}

const auth = (path, config) => supa('/auth/v1' + path, config);
const rpc = (name, data, options = {}) => supa('/rest/v1/rpc/' + name, { method: 'POST', data, ...options });
const table = (path, options = {}) => supa('/rest/v1/' + path, { service: true, ...options });
const publicUser = user => ({ id: user.id, email: user.email, admin: user.id === setting('DX_ADMIN_USER_ID') });

async function sessionFor(req) {
  const jar = cookies(req);
  const token = jar.dx_access && decodeURIComponent(jar.dx_access);
  if (token) {
    try { return { user: await auth('/user', { token }), token }; }
    catch (error) { if (![401, 403].includes(error.status)) throw error; }
  }
  if (jar.dx_refresh) {
    try {
      const session = await auth('/token?grant_type=refresh_token', { method: 'POST', data: { refresh_token: decodeURIComponent(jar.dx_refresh) } });
      return { user: session.user, token: session.access_token, session };
    } catch (error) { if (![400, 401, 403].includes(error.status)) throw error; }
  }
  return { user: null, session: token || jar.dx_refresh ? {} : undefined };
}

async function body(req, max = 16000) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw fail(415, 'Format JSON requis.');
  const reader = req.body?.getReader();
  if (!reader) throw fail(400, 'Données manquantes.');
  let size = 0;
  const chunks = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw fail(413, 'Sauvegarde ou requête trop volumineuse.'); }
    chunks.push(value);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error();
    return result;
  } catch { throw fail(400, 'Données invalides.'); }
}

const requireUser = session => {
  if (!session.user) throw fail(401, 'Connectez-vous pour continuer.');
  return session.user;
};

async function limit(kind, identifier, maximum, seconds) {
  const allowed = await rpc('dx_limit', { p_key: hash(kind + ':' + identifier), p_max: maximum, p_seconds: seconds }, { service: true });
  if (!allowed) throw fail(429, 'Trop de demandes. Réessayez plus tard.');
}

function credentials(input, min) {
  const email = String(input.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Adresse email invalide.');
  const password = input.password;
  if (min && (typeof password !== 'string' || password.length < min || password.length > 128)) throw fail(400, `Mot de passe requis (${min} à 128 caractères).`);
  return min ? { email, password } : { email };
}

function stateInput(input) {
  const { state, revision } = input;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!Number.isSafeInteger(revision) || revision < 0 || !object(state) || !object(state.profil) ||
    !['devis', 'prestations', 'modeles'].every(key => Array.isArray(state[key]) &&
      state[key].every(row => object(row) && validId(row.id)) &&
      new Set(state[key].map(row => row.id)).size === state[key].length)) throw fail(400, 'Sauvegarde invalide.');
  return { p_revision: revision, p_state: state };
}

export default async function handler(req, context) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v2\/?/, '');
  const ip = context?.ip || 'unknown';
  let current = {};
  const send = (data, status) => output(data, current.session, req, status);
  const method = req.method;
  if (method === 'GET' && path === 'config') return send({ enabled: ready(), google: ready() && setting('DX_GOOGLE_ENABLED') === 'true' });
  if (!ready()) return send({ error: 'Le service en ligne est indisponible. Vos données locales restent accessibles.' }, 503);
  if (method !== 'GET' && (req.headers.get('origin') !== originOf(req) || method !== 'POST')) return send({ error: 'Requête non autorisée.' }, 403);
  try {
    if (method === 'POST' && ['signup', 'login', 'recover'].includes(path)) {
      const input = await body(req);
      const data = credentials(input, path === 'signup' ? 10 : path === 'login' ? 1 : 0);
      await limit(path, ip, path === 'login' ? 30 : 10, 3600);
      const redirect = `${originOf(req)}/app/confirmation.html`;
      if (path === 'login') {
        current.session = await auth('/token?grant_type=password', { method: 'POST', data });
        return send({ user: publicUser(current.session.user) });
      }
      if (path === 'signup') {
        await auth('/signup?redirect_to=' + encodeURIComponent(redirect), { method: 'POST',
          data: { ...data, data: { dx_test: input.test === true } },
        });
      } else {
        await auth('/recover?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', data });
      }
      return send({ ok: true });
    }
    if (method === 'GET' && path === 'google' && setting('DX_GOOGLE_ENABLED') === 'true') {
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const query = new URLSearchParams({ provider: 'google', redirect_to: originOf(req) + '/api/v2/callback', code_challenge: challenge, code_challenge_method: 's256' });
      return new Response(null, { status: 302, headers: { Location: setting('SUPABASE_URL') + '/auth/v1/authorize?' + query, 'Set-Cookie': cookie('pkce', verifier, 600, req), 'Cache-Control': 'no-store' } });
    }
    if (method === 'POST' && path === 'confirm-email') {
      const { token, type } = await body(req, 1000);
      if (!validId(token) || !['email', 'signup', 'recovery'].includes(type)) throw fail(400, 'Lien invalide ou expiré.');
      await limit('confirm-email', ip, 25, 3600);
      current.session = await auth('/verify', { method: 'POST', data: { token_hash: token, type } });
      return send({ next: type === 'recovery' ? '/app/?compte=reinitialiser' : '/app/?compte=connexion' });
    }
    if (method === 'GET' && path === 'callback') {
      const type = url.searchParams.get('type');
      const token = url.searchParams.get('token_hash');
      const code = url.searchParams.get('code');
      const verifier = cookies(req).dx_pkce;
      if (validId(token) && ['email', 'signup', 'recovery'].includes(type)) {
        const fragment = new URLSearchParams({ token, type });
        return new Response(null, { status: 303, headers: {
          Location: '/app/confirmation.html#' + fragment, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        } });
      }
      if (!code || !verifier) throw fail(400, 'Lien invalide ou expiré.');
      current.session = await auth('/token?grant_type=pkce', { method: 'POST', data: { auth_code: code, code_verifier: verifier } });
      const headers = output({}, current.session, req).headers;
      headers.append('Set-Cookie', cookie('pkce', '', 0, req));
      headers.set('Location', '/app/?compte=connexion');
      headers.set('Referrer-Policy', 'no-referrer');
      return new Response(null, { status: 303, headers });
    }
    if (method === 'GET' && path === 'reviews') {
      const columns = ['id', 'rating', 'author', 'trade', 'company', 'profile', 'comment', 'published_at', 'experience_date'];
      const rows = await table('dx_reviews?status=eq.published&select=' + columns.join(',') + '&order=published_at.desc&limit=100');
      const reviews = rows.map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
      return send({ reviews });
    }
    if (method === 'POST' && path === 'reviews') {
      const input = await body(req, 8000);
      const clean = key => typeof input[key] === 'string' ? input[key].trim() : '';
      const review = { rating: input.rating, author: clean('author'), trade: clean('trade'), company: clean('company'), profile: input.profile, comment: clean('comment') };
      if (input.website) return send({ ok: true });
      const dateValue = clean('experienceDate');
      const date = new Date(dateValue + 'T00:00:00Z');
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !Number.isFinite(date.valueOf()) ||
        date.toISOString().slice(0, 10) !== dateValue || dateValue > today) throw fail(400, 'Date d’utilisation invalide.');
      review.experience_date = dateValue;
      if (input.consent !== true || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 ||
        !['professionnel', 'beta'].includes(review.profile) ||
        !review.author || review.author.length > 60 || !review.trade || review.trade.length > 80 || review.company.length > 100 ||
        review.comment.length < 10 || review.comment.length > 1200) throw fail(400, 'Veuillez vérifier les champs de votre avis et confirmer sa publication éventuelle.');
      await limit('review', ip, 3, 86400);
      const receipt = randomBytes(24).toString('base64url');
      const fingerprint = hash(JSON.stringify([review.author.toLowerCase(), review.comment.toLowerCase()]));
      const [saved] = await table('dx_reviews?select=id', { method: 'POST', data: { ...review, receipt_hash: hash(receipt), fingerprint }, prefer: 'return=representation' });
      return send({ ok: true, receipt: saved.id + '.' + receipt }, 201);
    }
    if (method === 'POST' && path === 'review-withdraw') {
      const input = await body(req);
      const [id, receipt] = String(input.receipt || '').trim().split('.');
      if (!uuid.test(id) || !validId(receipt)) throw fail(400, 'Code de retrait invalide.');
      await limit('withdraw', ip, 12, 3600);
      await table(`dx_reviews?id=eq.${id}&receipt_hash=eq.${hash(receipt)}`, { method: 'DELETE' });
      return send({ ok: true });
    }
    current = await sessionFor(req);
    if (method === 'GET' && path === 'session') return send({ user: current.user ? publicUser(current.user) : null });
    if (method === 'POST' && path === 'logout') {
      if (current.user) await auth('/logout?scope=local', { method: 'POST', token: current.token });
      current.session = {};
      return send({ ok: true });
    }
    if (method === 'POST' && ['event', 'analytics-erase'].includes(path)) {
      const input = await body(req, 2000);
      if (input.test === true || (path === 'event' && current.user?.user_metadata?.dx_test === true) || current.user?.id === setting('DX_ADMIN_USER_ID')) return send({ ok: true });
      if (!uuid.test(input.browser)) throw fail(400, 'Navigateur invalide.');
      const actor = current.user ? hash('user:' + current.user.id) : hash('browser:' + input.browser);
      const browser = hash('browser:' + input.browser);
      if (path === 'analytics-erase') {
        await table(`dx_events?or=(actor.eq.${actor},actor.eq.${browser})`, { method: 'DELETE' });
        return send({ ok: true });
      }
      if (input.consent !== true || !events.includes(input.kind) || !validId(input.eventId)) throw fail(400, 'Événement invalide.');
      await limit('event', ip, 600, 3600);
      const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
      const eventId = ['visite', 'activite'].includes(input.kind) ? day : input.eventId;
      const eventKey = ['devis', 'devis_professionnel'].includes(input.kind) ? eventId : actor + ':' + eventId;
      await table('dx_events?on_conflict=event_key', { method: 'POST', data: {
        event_key: hash(input.kind + ':' + eventKey), kind: input.kind, actor,
        account: Boolean(current.user), profile: profiles.includes(input.profile) ? input.profile : profiles[2],
      }, prefer: 'resolution=ignore-duplicates' });
      return send({ ok: true });
    }

    const user = requireUser(current);
    if (method === 'POST' && path === 'password') {
      const input = await body(req);
      const { password } = credentials({ email: user.email, password: input.password }, 10);
      await auth('/user', { method: 'PUT', token: current.token, data: { password } });
      return send({ ok: true });
    }
    if (method === 'POST' && path === 'delete-account') {
      const input = await body(req);
      if (input.confirm !== 'SUPPRIMER') throw fail(400, 'Confirmation requise.');
      if (user.id === setting('DX_ADMIN_USER_ID')) throw fail(403, 'Le compte administrateur se gère depuis Supabase.');
      await table('dx_events?actor=eq.' + hash('user:' + user.id), { method: 'DELETE' });
      await auth('/admin/users/' + user.id, { method: 'DELETE', service: true });
      current.session = {};
      return send({ ok: true });
    }
    if (path === 'workspace' && method === 'GET') {
      const expected = Number(url.searchParams.get('revision') || 0);
      const selector = '/rest/v1/dx_workspaces?user_id=eq.' + user.id;
      if (expected > 0 && Number.isSafeInteger(expected)) {
        const [known] = await supa(selector + '&select=revision&revision=eq.' + expected, { token: current.token });
        if (known) return send({ owner: user.id, revision: expected, unchanged: true });
      }
      const rows = await supa(selector + '&select=state,revision', { token: current.token });
      return send({ owner: user.id, ...(rows[0] || { state: null, revision: 0 }) });
    }
    if (path === 'workspace' && method === 'POST') {
      const input = await body(req, 3600000);
      if (input.owner !== user.id) throw fail(409, 'Le compte actif a changé.');
      const value = stateInput(input);
      const result = await rpc('dx_write_workspace', value, { token: current.token });
      if (result === null) return send({ error: 'Une sauvegarde plus récente existe.' }, 409);
      return send({ revision: result });
    }
    if (path.startsWith('admin/')) {
      if (user.id !== setting('DX_ADMIN_USER_ID')) throw fail(403, 'Accès administrateur requis.');
      if (method === 'GET' && path === 'admin/stats') {
        const days = Number(url.searchParams.get('days') ?? 7);
        if (![0, 1, 7, 30].includes(days)) throw fail(400, 'Période invalide.');
        return send(await rpc('dx_stats', { p_days: days, p_admin: user.id }, { service: true }));
      }
      if (method === 'GET' && path === 'admin/reviews') {
        const status = url.searchParams.get('status') || 'pending';
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!['pending', 'published', 'rejected', 'withdrawn'].includes(status) || !Number.isSafeInteger(offset) || offset < 0) throw fail(400, 'Filtre invalide.');
        return send({ reviews: await table(`dx_reviews?status=eq.${status}&order=created_at.desc,id&offset=${offset}&limit=50&select=id,rating,author,trade,company,profile,comment,created_at,status,experience_date`) });
      }
      if (method === 'POST' && path === 'admin/reviews') {
        const { id, status, previous } = await body(req);
        const transitions = { pending: ['published', 'rejected'], published: ['withdrawn'], rejected: ['published'], withdrawn: [] };
        if (!uuid.test(id) || !Object.hasOwn(transitions, previous) || !transitions[previous].includes(status)) throw fail(400, 'Action invalide.');
        const rows = await table(`dx_reviews?id=eq.${id}&status=eq.${previous}&select=id`, {
          method: 'PATCH', data: { status, published_at: status === 'published' ? new Date().toISOString() : null }, prefer: 'return=representation',
        });
        return rows.length ? send({ ok: true }) : send({ error: 'Cet avis a déjà changé. Actualisez la liste.' }, 409);
      }
    }
    return send({ error: 'Route inconnue.' }, 404);
  } catch (error) {
    if (error.status === 409 && path === 'reviews') return send({ error: 'Cet avis a déjà été transmis.' }, 409);
    const clientStatus = [400, 401, 403, 409, 413, 415, 422, 429].includes(error.status);
    const message = error.status === 429 ? 'Trop de demandes. Réessayez plus tard.' :
      !clientStatus ? 'Service temporairement indisponible.' :
      path === 'login' ? 'Connexion refusée. Vérifiez vos identifiants et la confirmation de votre email.' :
      path === 'confirm-email' ? 'Ce lien est expiré ou déjà utilisé. Demandez un nouveau lien depuis votre compte.' :
      ['signup', 'recover', 'password'].includes(path) ? 'Demande refusée. Vérifiez les informations saisies et réessayez.' : error.message;
    return send({ error: message }, clientStatus ? error.status : 503);
  }
}

export const config = { path: ['/api/v2', '/api/v2/*'], rateLimit: { windowLimit: 240, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
