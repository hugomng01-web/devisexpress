import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startTestServer } from './server.mjs';
import { mergeWorkspace } from '../public/app/merge.js';

const server = await startTestServer();
const { base } = server;
const guest = client(), alice = client(), bob = client(), owner = client();
const password = 'Password-local-fictif';
function client() {
  const jar = new Map();
  return async (path, payload) => {
    const headers = { cookie: [...jar].map(entries => entries.join('=')).join('; ') };
    const options = { headers, redirect: 'manual' };
    if (payload !== undefined) {
      options.method = 'POST';
      options.body = JSON.stringify(payload);
      headers.origin = base;
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(base + '/api/v2/' + path, options);
    for (const cookie of response.headers.getSetCookie()) {
      const [key, value] = cookie.split(';')[0].split('=');
      if (value) jar.set(key, value); else jar.delete(key);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
    }
    return { status: response.status, location: response.headers.get('location'), data: await response.json().catch(() => null) };
  };
}
const sample = { profil: { nom: 'Fiche fictive', prochainNumero: 1 }, devis: [], prestations: [], modeles: [] };
try {
  assert.equal((await guest('config')).data.enabled, true);
  assert.equal((await guest('admin/stats')).status, 401);
  assert.equal((await guest('workspace')).status, 401);
  for (const [agent, email] of [[alice, 'alice@example.invalid'], [bob, 'bob@example.invalid']]) {
    assert.equal((await agent('signup', { email, password })).status, 200);
    assert.equal((await agent('login', { email, password })).status, 400);
    const token = server.codes.get(email);
    const link = 'callback?type=signup&token_hash=' + token;
    assert.match((await agent(link)).location, /^\/app\/confirmation.html#/);
    assert.equal((await agent(link)).status, 303);
    assert.equal((await agent('session')).data.user, null);
    assert.equal((await agent('confirm-email', { type: 'signup', token })).status, 200);
    assert.equal((await agent('confirm-email', { type: 'signup', token })).status, 403);
    assert.equal((await agent('workspace')).data.revision, 0);
  }
  const aliceId = (await alice('session')).data.user.id;
  assert.equal((await alice('workspace', { owner: aliceId, revision: 0, state: sample })).data.revision, 1);
  assert.deepEqual((await alice('workspace')).data.state, sample);
  assert.deepEqual((await alice('workspace?revision=1')).data, { owner: aliceId, revision: 1, unchanged: true });
  assert.deepEqual((await alice('workspace?revision=2')).data.state, sample);
  const provider = process.env.AI_PROVIDER;
  delete process.env.AI_PROVIDER;
  process.env.ANTHROPIC_API_KEY = 'not-a-real-key';
  assert.deepEqual(await (await fetch(base + '/api/ai')).json(), { enabled: false });
  delete process.env.ANTHROPIC_API_KEY;
  process.env.AI_PROVIDER = provider;
  assert.equal((await alice('workspace', { owner: aliceId, revision: 0, state: sample })).status, 409);
  assert.equal((await bob('workspace')).data.state, null);
  assert.equal((await bob('workspace', { owner: aliceId, revision: 1, state: sample })).status, 409);
  assert.equal((await bob('admin/reviews')).status, 403);
  assert.equal((await bob('admin/stats')).status, 403);
  assert.equal((await alice('logout', {})).status, 200);
  assert.equal((await alice('session')).data.user, null);
  const email = 'alice@example.invalid';
  assert.equal((await alice('recover', { email })).status, 200);
  assert.equal((await alice('confirm-email', { type: 'recovery', token: server.codes.get(email) })).data.next, '/app/?compte=reinitialiser');
  assert.equal((await alice('password', { password: 'New-Mot-de-Passe' })).status, 200);
  await alice('logout', {});
  assert.equal((await alice('login', { email, password: 'New-Mot-de-Passe' })).status, 200);
  const review = { experienceDate: '2025-01-01', rating: 2, author: 'Fictif', trade: 'Test', profile: 'beta', comment: 'Uniquement utilisé dans ce test local.', consent: true };
  assert.equal((await guest('reviews', { ...review, consent: false })).status, 400);
  const receipt = (await guest('reviews', review)).data.receipt;
  const [id] = receipt.split('.');
  assert.equal((await guest('reviews', review)).status, 409);
  assert.equal((await guest('reviews')).data.reviews.length, 0);
  await owner('login', { email: 'admin@example.invalid', password: 'secret-admin-test' });
  assert.equal((await owner('admin/reviews')).data.reviews.length, 1);
  assert.equal((await owner('admin/reviews', { id, previous: 'pending', status: 'published' })).status, 200);
  assert.equal((await guest('reviews')).data.reviews.length, 1);
  assert.equal((await guest('review-withdraw', { receipt })).status, 200);
  assert.equal((await guest('reviews')).data.reviews.length, 0);

  const event = { kind: 'devis', eventId: randomUUID(), browser: randomUUID(), profile: 'beta', consent: true };
  assert.equal((await guest('event', { ...event, consent: false })).status, 400);
  assert.equal((await guest('event', { ...event, test: true })).status, 200);
  assert.equal((await owner('event', event)).status, 200);
  assert.equal(server.events.size, 0);
  await guest('event', event);
  await guest('event', event);
  assert.equal((await owner('admin/stats?days=7')).data.quotes, 1);
  assert.equal(JSON.stringify([...server.events.values()]).includes(event.browser), false);

  const left = { ...sample, profil: { ...sample.profil, ville: 'Lyon' } };
  const right = { ...sample, prestations: [{ id: randomUUID() }] };
  const different = mergeWorkspace(sample, left, right);
  assert.equal(different.merged.profil.ville, 'Lyon');
  assert.equal(different.merged.prestations.length, 1);
  assert.deepEqual(different.conflicts, []);
  const overlap = mergeWorkspace(sample, left, { ...right, profil: { ...sample.profil, ville: 'Bron' } });
  assert.equal(overlap.conflicts.length, 1);
  assert.equal((await alice('delete-account', { confirm: 'SUPPRIMER' })).status, 200);
  assert.equal(server.workspace.has(aliceId), false);
  assert.equal((await alice('session')).data.user, null);
  console.log('API locale : inscription, vérification, connexion, déconnexion, réinitialisation et suppression ; révisions, refus croisés, séparation admin, dépôt/modération/retrait d’avis, consentement, déduplication, exclusion des tests et fusion vérifiés.');
} finally { await server.close(); }
