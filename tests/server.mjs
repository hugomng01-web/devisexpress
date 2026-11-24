import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import v2 from '../netlify/functions/v2.mjs';
import ai from '../netlify/functions/ai.mjs';

export async function startTestServer() {
  process.env.SUPABASE_URL = 'https://supabase.invalid';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
  process.env.DX_HASH_SECRET = 'fictitious-local-only-'.repeat(3);
  process.env.AI_PROVIDER = 'openai';
  process.env.OPENAI_BASE_URL = 'https://groq.invalid/openai/v1';
  process.env.OPENAI_API_KEY = 'test-groq';
  process.env.DX_ADMIN_USER_ID = randomUUID();
  delete process.env.ALLOWED_ORIGIN;
  const users = new Map();
  const admin = { id: process.env.DX_ADMIN_USER_ID, email: 'admin@example.invalid', password: 'secret-admin-test', confirmed: true };
  users.set(admin.email, admin);
  const sessions = new Map(), codes = new Map(), workspace = new Map(), reviews = [], events = new Map();
  let lastPrompt;
  const originalFetch = globalThis.fetch;
  const reply = (data, status = 200) => Response.json(data, { status });
  const accept = user => {
    const access_token = randomUUID(), refresh_token = randomUUID();
    sessions.set(access_token, user);
    sessions.set(refresh_token, user);
    return reply({ user: { email: user.email, id: user.id }, access_token, refresh_token, expires_in: 3600 });
  };
  globalThis.fetch = async (input, opts = {}) => {
    const url = new URL(input);
    if (url.hostname === 'groq.invalid') {
      lastPrompt = JSON.parse(opts.body).messages[0].content;
      return reply({ choices: [{ message: { content: '{"objet":"Chauffe-eau","lignes":[{"designation":"Pose chauffe-eau","qte":1,"unite":"u","pu":125,"estime":true}]}' } }] });
    }
    if (url.hostname !== 'supabase.invalid') return originalFetch(input, opts);
    const { method = 'GET', headers = {} } = opts;
    const data = opts.body ? JSON.parse(opts.body) : {};
    const path = url.pathname;
    const auth = sessions.get(headers.Authorization?.slice(7));
    const service = headers.Authorization === 'Bearer test-service';
    if (path.endsWith('/signup')) {
      users.set(data.email, { id: randomUUID(), email: data.email, password: data.password, confirmed: false });
      codes.set(data.email, randomUUID());
      return reply({ ok: true });
    }
    if (path.endsWith('/recover')) {
      if (users.has(data.email)) codes.set(data.email, randomUUID());
      return reply({ ok: true });
    }
    if (path.endsWith('/verify')) {
      const email = [...codes].find(([, value]) => value === data.token_hash)?.[0];
      if (!email) return reply({ msg: 'Lien invalide' }, 403);
      codes.delete(email);
      const user = users.get(email);
      user.confirmed = true;
      return accept(user);
    }
    if (path.endsWith('/token')) {
      if (data.refresh_token) return sessions.has(data.refresh_token) ? accept(sessions.get(data.refresh_token)) : reply({}, 401);
      const user = users.get(data.email);
      return user?.confirmed && user.password === data.password ? accept(user) : reply({ msg: 'Invalid login' }, 400);
    }
    if (path.endsWith('/logout')) return new Response(null, { status: 204 });
    if (path.endsWith('/user')) {
      if (!auth || !users.has(auth.email)) return reply({ msg: 'No session' }, 401);
      if (method === 'PUT') auth.password = data.password;
      return reply({ id: auth.id, email: auth.email });
    }
    if (path.includes('/admin/users/') && service) {
      const id = path.split('/').at(-1);
      for (const [email, user] of users) if (user.id === id) users.delete(email);
      workspace.delete(id);
      return reply({});
    }
    if (path.endsWith('/dx_workspaces')) {
      if (!auth) return reply({}, 401);
      const row = workspace.get(auth.id);
      if (url.searchParams.get('select') === 'revision') {
        return reply(row && url.searchParams.get('revision') === 'eq.' + row.revision ? [{ revision: row.revision }] : []);
      }
      return reply(row ? [row] : []);
    }
    if (path.endsWith('/dx_write_workspace')) {
      if (!auth) return reply({}, 401);
      const previous = workspace.get(auth.id);
      if ((previous?.revision || 0) !== data.p_revision) return reply(null);
      workspace.set(auth.id, { revision: data.p_revision + 1, state: data.p_state });
      return reply(data.p_revision + 1);
    }
    if (!service) return reply({}, 403);
    if (path.endsWith('/dx_limit')) return reply(true);
    if (path.endsWith('/dx_reviews')) {
      const value = key => url.searchParams.get(key)?.slice(3);
      if (method === 'POST') {
        if (reviews.some(review => review.fingerprint === data.fingerprint)) return reply({}, 409);
        const review = { ...data, id: randomUUID(), status: 'pending', created_at: new Date().toISOString() };
        reviews.push(review);
        return reply([{ id: review.id }], 201);
      }
      if (method === 'PATCH') {
        const review = reviews.find(item => item.id === value('id') && item.status === value('status'));
        return reply(review ? [Object.assign(review, data)] : []);
      }
      if (method === 'DELETE') {
        const index = reviews.findIndex(item => item.id === value('id') && item.receipt_hash === value('receipt_hash'));
        if (index >= 0) reviews.splice(index, 1);
        return new Response(null, { status: 204 });
      }
      return reply(reviews.filter(review => review.status === value('status')));
    }
    if (path.endsWith('/dx_events')) {
      if (method === 'POST' && !events.has(data.event_key)) events.set(data.event_key, data);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/dx_stats')) return reply({
      accounts_total: [...users.values()].filter(user => user.confirmed && user.id !== admin.id).length,
      quotes: [...events.values()].filter(event => event.kind === 'devis').length,
      reviews_received: reviews.length,
      reviews_published: reviews.filter(review => review.status === 'published').length,
      series: events.size ? [{ date: new Date().toISOString().slice(0,10), accounts: 1, quotes: 1, active: 1 }] : [],
    });
    return reply({}, 404);
  };
  const webroot = resolve('public');
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
  const server = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url, 'http://' + incoming.headers.host);
    try {
      if (url.pathname.startsWith('/api/')) {
        const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : Readable.toWeb(incoming);
        const request = new Request(url, { method: incoming.method, headers: incoming.headers, body, duplex: 'half' });
        const response = await (url.pathname === '/api/ai' ? ai : v2)(request, { ip: '127.0.0.1' });
        const headers = Object.fromEntries(response.headers);
        if (response.headers.getSetCookie().length) headers['set-cookie'] = response.headers.getSetCookie();
        outgoing.writeHead(response.status, headers);
        outgoing.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      let file = resolve(webroot, '.' + decodeURIComponent(url.pathname));
      if (file !== webroot && !file.startsWith(webroot + '/')) { outgoing.writeHead(404).end(); return; }
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      outgoing.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      outgoing.end(await readFile(file));
    } catch {
      outgoing.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { base: 'http://127.0.0.1:' + server.address().port, users, codes, reviews, workspace, events, get prompt() { return lastPrompt; }, close() {
    globalThis.fetch = originalFetch;
    return new Promise(resolve => server.close(resolve));
  } };
}
