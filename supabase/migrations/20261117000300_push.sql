-- Lembrete diário por notificação (Web Push).
-- Inscrições por aparelho, hora do lembrete nas preferências e chaves VAPID no Vault.
-- A chave privada é gerada pela Edge Function "push" na primeira chamada e nunca sai do Supabase.

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy own_rows on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Hora do lembrete (0 a 23, horário de Brasília); nulo = desligado.
alter table public.settings add column reminder_hour smallint check (reminder_hour between 0 and 23);

create function public.store_vapid_keys(p_public text, p_private_jwk text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from vault.secrets where name = 'vapid_private_jwk') then return; end if;
  perform vault.create_secret(p_private_jwk, 'vapid_private_jwk');
  perform vault.create_secret(p_public, 'vapid_public_key');
end $$;

create function public.vapid_private_jwk()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_jwk'
$$;

create function public.vapid_public_key()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'
$$;

revoke all on function public.store_vapid_keys(text, text) from public, anon, authenticated;
revoke all on function public.vapid_private_jwk() from public, anon, authenticated;
revoke all on function public.vapid_public_key() from public, anon;
grant execute on function public.store_vapid_keys(text, text) to service_role;
grant execute on function public.vapid_private_jwk() to service_role;
grant execute on function public.vapid_public_key() to authenticated, service_role;
