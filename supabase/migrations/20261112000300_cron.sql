-- Agenda as Edge Functions pelo pg_cron.
-- O segredo que autentica o cron é gerado aqui dentro e guardado no Vault: nunca sai do banco.
-- A URL do projeto também fica no Vault; grave antes de aplicar (ver README):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'cron_secret');
  end if;
end $$;

-- As Edge Functions perguntam ao banco se o segredo recebido é o do cron.
create function public.is_cron_secret(candidate text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets where name = 'cron_secret' and decrypted_secret = candidate)
$$;
revoke all on function public.is_cron_secret(text) from public, anon, authenticated;
grant execute on function public.is_cron_secret(text) to service_role;

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
