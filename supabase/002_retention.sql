-- Activer d'abord l'extension pg_cron dans Supabase. Exécuter une seule fois par projet.
select cron.schedule('devisexpress-retention', '20 2 * * *', $job$
  delete from public.dx_limits where to_timestamp(bucket * period) < now() - interval '2 days';
  delete from public.dx_events where created_at < now() - interval '6 months';
  delete from public.dx_reviews where status <> 'published' and created_at < now() - interval '3 months';
$job$);
