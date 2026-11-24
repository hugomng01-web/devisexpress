import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.DX_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const data = { profil: { nom: 'Fiche fictive' }, devis: [], modeles: [], prestations: [] };
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, created_at timestamptz default now(), email_confirmed_at timestamptz default now(), raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    insert into auth.users(id) values ('${alice}'), ('${bob}');
  `);
  await db.exec(await readFile(new URL('../supabase/001_v2.sql', import.meta.url), 'utf8'));
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
  const write = async revision => (await db.query('select public.dx_write_workspace($1,$2::jsonb) as revision', [revision, JSON.stringify(data)])).rows[0].revision;
  assert.equal(await write(0), 1);
  assert.equal(await write(0), null);
  assert.equal(await write(1), 2);
  assert.equal(await write(1), null);
  assert.deepEqual((await db.query('select state from public.dx_workspaces')).rows[0].state, data);
  await assert.rejects(() => db.query('select * from public.dx_reviews'), /permission denied/i);
  await assert.rejects(() => db.query('select public.dx_stats(7, $1)', [alice]), /permission denied/i);
  await db.exec(`set request.jwt.claim.sub = '${bob}';`);
  assert.equal((await db.query('select * from public.dx_workspaces')).rows.length, 0);
  assert.equal(await write(2), null);
  assert.equal(await write(0), 1);
  assert.equal((await db.query('select user_id from public.dx_workspaces')).rows[0].user_id, bob);
  await db.exec('reset role; set role anon;');
  await assert.rejects(() => db.query('select * from public.dx_workspaces'), /permission denied/i);
  await db.exec('reset role; set role service_role;');
  for (const expected of [true, true, false]) {
    assert.equal((await db.query("select public.dx_limit('test', 2, 3600) as accepted")).rows[0].accepted, expected);
  }
  await db.exec(`insert into public.dx_events(event_key,actor,account,kind,profile)
    values ('a','actor',true,'activite','professionnel'), ('b','actor',true,'devis','professionnel')`);
  const stats = (await db.query('select public.dx_stats(7,$1) as stats', [alice])).rows[0].stats;
  assert.equal(stats.accounts_total, 1);
  assert.equal(stats.active_accounts, 1);
  assert.equal(stats.declared_pro, 1);
  assert.equal(stats.quotes, 1);
  await db.exec('reset role;');
  await db.query('delete from auth.users where id = $1', [alice]);
  assert.equal((await db.query('select * from public.dx_workspaces where user_id=$1', [alice])).rows.length, 0);
  console.log('SQL : migration PostgreSQL, politiques RLS, écriture conditionnelle, quotas, agrégats et suppression en cascade vérifiés.');
} finally { await db.close(); }
