-- Agenda as Edge Functions. Antes de aplicar, grave dois segredos no Vault (ver README):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<mesmo valor do secret CRON_SECRET das funções>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create function public.call_edge_function(fn text)
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000)
$$;
revoke all on function public.call_edge_function(text) from public, anon, authenticated;

-- A cada 15 min. A função decide o que buscar: cripto sempre; B3 e câmbio só em horário de pregão.
select cron.schedule('update-prices', '*/15 * * * *', $$select public.call_edge_function('update-prices')$$);
-- 23:55 de Brasília (02:55 UTC).
select cron.schedule('daily-snapshot', '55 2 * * *', $$select public.call_edge_function('daily-snapshot')$$);
