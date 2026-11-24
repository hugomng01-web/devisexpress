begin;

create table public.dx_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  state jsonb not null check (
    jsonb_typeof(state) = 'object' and
    state ?& array['profil','devis','prestations','modeles'] and
    jsonb_typeof(state->'profil') = 'object' and
    jsonb_typeof(state->'devis') = 'array' and
    jsonb_typeof(state->'prestations') = 'array' and
    jsonb_typeof(state->'modeles') = 'array' and
    octet_length(state::text) <= 4000000
  ),
  updated_at timestamptz not null default now()
);
alter table public.dx_workspaces enable row level security;
revoke all on public.dx_workspaces from public, anon, authenticated;
grant select on public.dx_workspaces to authenticated;
create policy dx_read_own_workspace on public.dx_workspaces for select to authenticated using (auth.uid() = user_id);

create function public.dx_write_workspace(p_revision bigint, p_state jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  next_revision bigint;
begin
  if owner_id is null or p_revision is null or p_revision < 0 then
    raise exception 'Session ou révision invalide' using errcode = '22023';
  end if;
  if p_revision = 0 then
    insert into public.dx_workspaces (user_id, revision, state)
      values (owner_id, 1, p_state)
      on conflict (user_id) do nothing returning revision into next_revision;
  else
    update public.dx_workspaces set revision = revision + 1, state = p_state, updated_at = now()
      where user_id = owner_id and revision = p_revision returning revision into next_revision;
  end if;
  return next_revision;
end;
$$;
revoke all on function public.dx_write_workspace(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.dx_write_workspace(bigint,jsonb) to authenticated;

create table public.dx_reviews (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','published','rejected','withdrawn')),
  rating smallint not null check (rating between 1 and 5),
  author text not null check (length(author) between 1 and 60),
  trade text not null check (length(trade) between 1 and 80),
  company text not null default '' check (length(company) <= 100),
  profile text not null check (profile in ('professionnel','beta')),
  comment text not null check (length(comment) between 10 and 1200),
  experience_date date not null,
  receipt_hash text not null,
  fingerprint text not null unique,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check ((status = 'published') = (published_at is not null))
);
create index dx_review_status_time on public.dx_reviews (status, created_at desc);

create table public.dx_events (
  event_key text primary key,
  actor text not null,
  account boolean not null,
  kind text not null check (kind in ('visite','activite','devis','devis_professionnel','pdf','relance','ia')),
  profile text not null check (profile in ('professionnel','beta','non_renseigne')),
  created_at timestamptz not null default now()
);
create index dx_events_time on public.dx_events (created_at);
create index dx_events_actor on public.dx_events (actor);

create table public.dx_limits (
  key text not null,
  bucket bigint not null,
  period integer not null,
  hits integer not null,
  primary key (key, bucket, period)
);

alter table public.dx_reviews enable row level security;
alter table public.dx_events enable row level security;
alter table public.dx_limits enable row level security;
revoke all on public.dx_reviews, public.dx_events, public.dx_limits from public, anon, authenticated;
grant select, insert, update, delete on public.dx_reviews, public.dx_events to service_role;

create function public.dx_limit(p_key text, p_max integer, p_seconds integer)
returns boolean language sql security definer set search_path = '' as $$
  insert into public.dx_limits as limits (key, bucket, period, hits)
    values (p_key, floor(extract(epoch from now()) / p_seconds)::bigint, p_seconds, 1)
    on conflict (key, bucket, period) do update set hits = least(limits.hits + 1, p_max + 1)
    returning hits <= p_max;
$$;
revoke all on function public.dx_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.dx_limit(text,integer,integer) to service_role;

create function public.dx_stats(p_days integer, p_admin uuid)
returns jsonb language sql security definer set search_path = '' as $$
  with bounds as (
    select case when p_days = 0 then '-infinity'::timestamptz
      else (date_trunc('day', now() at time zone 'Europe/Paris') - ((p_days - 1) * interval '1 day')) at time zone 'Europe/Paris' end as start
  ), usage as (
    select actor, account, kind, profile, (created_at at time zone 'Europe/Paris')::date as day, created_at
    from public.dx_events, bounds where created_at >= bounds.start
  ), activity as (
    select actor, account, count(distinct day) active_days
    from usage where kind = 'activite' group by actor, account
  ), declared as (
    select distinct on (actor) actor, profile from usage
    where kind = 'activite' order by actor, created_at desc
  ), accounts as (
    select created_at, (created_at at time zone 'Europe/Paris')::date as day
    from auth.users where id <> p_admin and email_confirmed_at is not null
      and coalesce(raw_app_meta_data->>'dx_test', 'false') <> 'true'
      and coalesce(raw_user_meta_data->>'dx_test', 'false') <> 'true'
  ), calendar as (
    select day from usage union select day from accounts, bounds where created_at >= bounds.start
  )
  select jsonb_build_object(
    'visitors', (select count(distinct actor) from usage where kind = 'visite' and not account),
    'browsers', (select count(*) from activity where not account),
    'active_accounts', (select count(*) from activity where account),
    'returning_accounts', (select count(*) from activity where account and active_days > 1),
    'returning_browsers', (select count(*) from activity where not account and active_days > 1),
    'declared_pro', (select count(*) from declared where profile = 'professionnel'),
    'declared_beta', (select count(*) from declared where profile = 'beta'),
    'accounts_total', (select count(*) from accounts),
    'accounts_new', (select count(*) from accounts, bounds where created_at >= bounds.start),
    'quotes', (select count(*) from usage where kind = 'devis'),
    'pro_quotes', (select count(*) from usage where kind = 'devis_professionnel'),
    'pdfs', (select count(*) from usage where kind = 'pdf'),
    'reminders', (select count(*) from usage where kind = 'relance'),
    'ai', (select count(*) from usage where kind = 'ia'),
    'reviews_received', (select count(*) from public.dx_reviews, bounds where created_at >= bounds.start),
    'reviews_published', (select count(*) from public.dx_reviews, bounds where status = 'published' and published_at >= bounds.start),
    'reviews_average', (select round(avg(rating), 2) from public.dx_reviews, bounds where status = 'published' and published_at >= bounds.start),
    'series', coalesce((select jsonb_agg(jsonb_build_object(
       'date', calendar.day,
       'accounts', (select count(*) from accounts a where a.day = calendar.day),
       'quotes', (select count(*) from usage u where u.day = calendar.day and kind = 'devis'),
       'active', (select count(*) from usage u where u.day = calendar.day and kind = 'activite')
    ) order by calendar.day) from calendar), '[]'::jsonb)
  );
$$;
revoke all on function public.dx_stats(integer,uuid) from public, anon, authenticated;
grant execute on function public.dx_stats(integer,uuid) to service_role;

commit;
