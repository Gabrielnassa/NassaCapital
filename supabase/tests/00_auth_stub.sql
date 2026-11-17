-- Imita o mínimo do Supabase num Postgres puro, só para os testes: papéis, auth.users e auth.uid().
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Vault mínimo para os testes (no Supabase ele já existe).
create schema vault;
create table vault.secrets (name text primary key, secret text);
create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(secret text, name text) returns uuid language sql as $$
  insert into vault.secrets (name, secret) values (name, secret) returning gen_random_uuid()
$$;
