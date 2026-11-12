-- Carteira: schema, RLS e views.
-- Regras: todo valor monetário é numeric; saldo e preço médio vêm de transactions (fonte da verdade).

create type public.asset_class   as enum ('crypto', 'stock', 'fii', 'etf', 'stable', 'cash');
create type public.price_source  as enum ('coingecko', 'brapi', 'manual');
create type public.tx_type       as enum ('buy', 'sell', 'transfer_in', 'transfer_out');
create type public.dividend_type as enum ('dividend', 'jcp', 'income');
create type public.plan_status   as enum ('active', 'paused', 'done');
create type public.dca_frequency as enum ('daily', 'weekly', 'once');
create type public.exec_status   as enum ('pending', 'done', 'skipped');
create domain public.ccy as text check (value in ('BRL', 'USD'));

-- ---------------------------------------------------------------- tabelas

create table public.assets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker         text not null check (ticker = upper(ticker) and length(ticker) between 1 and 20),
  name           text not null,
  class          public.asset_class not null,
  source         public.price_source not null,
  source_id      text,                       -- ID do CoinGecko ou ticker da B3
  quote_currency public.ccy not null,
  created_at     timestamptz not null default now(),
  unique (user_id, ticker),
  check (source = 'manual' or source_id is not null)
);

create table public.brokers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.dca_plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null,
  total_amount     numeric not null check (total_amount > 0),
  source_currency  public.ccy not null,
  funding_asset_id uuid references public.assets (id) on delete set null, -- de onde sai o dinheiro (ex.: USDT)
  start_date       date not null,
  duration_days    integer not null check (duration_days between 1 and 3650),
  status           public.plan_status not null default 'active',
  created_at       timestamptz not null default now()
);

create table public.dca_plan_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id      uuid not null references public.dca_plans (id) on delete cascade,
  asset_id     uuid not null references public.assets (id) on delete restrict,
  percent      numeric check (percent > 0 and percent <= 100),
  fixed_amount numeric check (fixed_amount > 0),   -- valor por execução
  frequency    public.dca_frequency not null,
  check ((percent is null) <> (fixed_amount is null))
);

create table public.dca_executions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_item_id   uuid not null references public.dca_plan_items (id) on delete cascade,
  scheduled_date date not null,
  planned_amount numeric not null check (planned_amount > 0),
  status         public.exec_status not null default 'pending',
  transaction_id uuid
);

create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id         uuid not null references public.assets (id) on delete restrict,
  type             public.tx_type not null,
  date             date not null,
  quantity         numeric not null check (quantity > 0),
  unit_price       numeric not null check (unit_price >= 0),
  fee              numeric not null default 0 check (fee >= 0),
  currency         public.ccy not null,           -- moeda de unit_price e fee
  fx_rate_to_brl   numeric not null check (fx_rate_to_brl > 0), -- R$ por US$ 1 no dia do lançamento
  broker_id        uuid references public.brokers (id) on delete set null,
  dca_execution_id uuid references public.dca_executions (id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.dca_executions
  add constraint dca_executions_transaction_fk
  foreign key (transaction_id) references public.transactions (id) on delete set null;

create table public.dividends ( -- fase 2
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id     uuid not null references public.assets (id) on delete restrict,
  type         public.dividend_type not null,
  ex_date      date,
  pay_date     date not null,
  gross_amount numeric not null check (gross_amount >= 0),
  tax_withheld numeric not null default 0 check (tax_withheld >= 0),
  created_at   timestamptz not null default now()
);

-- Metas são gravadas em conjuntos: todas as linhas de um mesmo tipo (ativo ou classe)
-- com o mesmo valid_from formam um conjunto que soma 100%. Vale o conjunto mais recente.
create table public.targets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id   uuid references public.assets (id) on delete cascade,
  class      public.asset_class,
  percent    numeric not null check (percent > 0 and percent <= 100),
  valid_from date not null default current_date,
  check ((asset_id is null) <> (class is null)),
  unique (user_id, asset_id, valid_from),
  unique (user_id, class, valid_from)
);

-- Uma linha por ativo (asset_id) ou por par de câmbio (fx_pair = 'USD-BRL').
create table public.prices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  asset_id       uuid references public.assets (id) on delete cascade,
  fx_pair        text check (fx_pair in ('USD-BRL')),
  price          numeric not null check (price > 0),
  currency       public.ccy not null,
  change_pct_24h numeric,
  source_ts      timestamptz not null,   -- horário informado pela fonte
  fetched_at     timestamptz not null default now(),
  check ((asset_id is null) <> (fx_pair is null)),
  unique (user_id, asset_id),
  unique (user_id, fx_pair)
);

create table public.snapshots (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  date      date not null,
  class     public.asset_class not null,
  value_brl numeric not null,
  value_usd numeric not null,
  cost_brl  numeric not null,
  cost_usd  numeric not null,
  unique (user_id, date, class)
);

create table public.settings (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  main_currency public.ccy not null default 'BRL',
  theme         text not null default 'system' check (theme in ('system', 'light', 'dark'))
);

create index on public.transactions (user_id, asset_id, date);
create index on public.transactions (dca_execution_id);
create index on public.dca_plan_items (plan_id);
create index on public.dca_executions (plan_item_id);
create index on public.dca_executions (user_id, status, scheduled_date);
create index on public.targets (user_id, valid_from);
create index on public.dividends (user_id, asset_id);

-- ---------------------------------------------------------------- RLS

do $$
declare t text;
begin
  foreach t in array array['assets','brokers','transactions','dividends','targets','dca_plans',
                           'dca_plan_items','dca_executions','prices','snapshots','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;

  -- o dono lê e escreve
  foreach t in array array['assets','brokers','transactions','dividends','dca_plans',
                           'dca_plan_items','dca_executions','settings'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy own_rows on public.%I for all to authenticated
                      using (user_id = (select auth.uid()))
                      with check (user_id = (select auth.uid()))$p$, t);
  end loop;

  -- o dono só lê: targets (escrita via set_targets), prices e snapshots (escrita via Edge Functions)
  foreach t in array array['targets','prices','snapshots'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format($p$create policy own_rows_read on public.%I for select to authenticated
                      using (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- cálculo

create function public.convert_ccy(amount numeric, from_ccy text, to_ccy text, usd_brl numeric)
returns numeric language sql immutable as $$
  select case
    when from_ccy = to_ccy then amount
    when from_ccy = 'USD' and to_ccy = 'BRL' then amount * usd_brl
    when from_ccy = 'BRL' and to_ccy = 'USD' then amount / usd_brl
  end
$$;

-- Preço médio ponderado: compra/entrada soma custo (com taxa); venda/saída só reduz a quantidade.
-- Posição zerada reinicia o preço médio.
create type public.cost_state as (qty numeric, avg numeric);

create function public.avg_cost_step(s public.cost_state, t public.tx_type, q numeric, cost numeric)
returns public.cost_state language sql immutable as $$
  select case
    when t in ('buy', 'transfer_in') then
      row(s.qty + q, (s.qty * s.avg + cost) / (s.qty + q))::public.cost_state
    when s.qty - q <= 0 then row(0, 0)::public.cost_state
    else row(s.qty - q, s.avg)::public.cost_state
  end
$$;

create aggregate public.avg_cost(public.tx_type, numeric, numeric) (
  sfunc = public.avg_cost_step, stype = public.cost_state, initcond = '(0,0)'
);

-- Câmbio atual: cotação gravada pela Edge Function; sem ela, o câmbio do último lançamento.
create function public.current_usd_brl(uid uuid)
returns numeric language sql stable as $$
  select coalesce(
    (select p.price from public.prices p where p.user_id = uid and p.fx_pair = 'USD-BRL'),
    (select t.fx_rate_to_brl from public.transactions t where t.user_id = uid
      order by t.date desc, t.created_at desc limit 1))
$$;

create view public.v_positions with (security_invoker = true) as
with pos as (
  select t.asset_id,
         public.avg_cost(t.type, t.quantity,
           public.convert_ccy(t.quantity * t.unit_price + t.fee, t.currency, a.quote_currency, t.fx_rate_to_brl)
           order by t.date, t.created_at, t.id) as st
  from public.transactions t
  join public.assets a on a.id = t.asset_id
  group by t.asset_id
),
base as (
  select a.user_id, a.id as asset_id, a.ticker, a.name, a.class, a.source, a.quote_currency,
         coalesce((pos.st).qty, 0) as quantity,
         coalesce((pos.st).avg, 0) as avg_price,
         case when a.class = 'cash' then 1 else coalesce(p.price, lt.price) end as price,
         case when a.class = 'cash' then 'fixed'
              when p.price is not null then 'quote'
              when lt.price is not null then 'last_tx'
              else 'none' end as price_origin,
         p.source_ts as price_ts,
         p.change_pct_24h,
         public.current_usd_brl(a.user_id) as usd_brl
  from public.assets a
  left join pos on pos.asset_id = a.id
  left join public.prices p on p.asset_id = a.id
  left join lateral (
    select public.convert_ccy(t.unit_price, t.currency, a.quote_currency, t.fx_rate_to_brl) as price
    from public.transactions t
    where t.asset_id = a.id and t.unit_price > 0
    order by t.date desc, t.created_at desc limit 1
  ) lt on true
)
select b.user_id, b.asset_id, b.ticker, b.name, b.class, b.source, b.quote_currency,
       b.quantity, b.avg_price,
       b.quantity * b.avg_price as cost,
       b.price, b.price_origin, b.price_ts, b.change_pct_24h, b.usd_brl,
       b.quantity * b.price as value,
       b.quantity * b.price - b.quantity * b.avg_price as pl,
       case when b.quantity * b.avg_price > 0
            then (b.quantity * b.price / (b.quantity * b.avg_price) - 1) * 100 end as pl_pct,
       public.convert_ccy(b.quantity * b.price, b.quote_currency, 'BRL', b.usd_brl) as value_brl,
       public.convert_ccy(b.quantity * b.price, b.quote_currency, 'USD', b.usd_brl) as value_usd,
       public.convert_ccy(b.quantity * b.avg_price, b.quote_currency, 'BRL', b.usd_brl) as cost_brl,
       public.convert_ccy(b.quantity * b.avg_price, b.quote_currency, 'USD', b.usd_brl) as cost_usd
from base b;

create view public.v_targets_active with (security_invoker = true) as
select t.*
from public.targets t
where t.valid_from = (
  select max(t2.valid_from) from public.targets t2
  where t2.user_id = t.user_id
    and (t2.asset_id is null) = (t.asset_id is null)
    and t2.valid_from <= current_date
);

-- % atual vs meta, por ativo (kind = 'asset') e por classe (kind = 'class').
-- target_pct nulo = fora da meta. missing_* = quanto falta comprar para chegar na meta (nunca negativo).
create view public.v_allocation with (security_invoker = true) as
with pos as (select * from public.v_positions),
tot as (
  select user_id, sum(value_brl) as total_brl, sum(value_usd) as total_usd from pos group by user_id
),
rows as (
  select p.user_id, 'asset'::text as kind, p.asset_id, p.class, p.ticker,
         coalesce(p.value_brl, 0) as value_brl, coalesce(p.value_usd, 0) as value_usd,
         ta.percent as target_pct
  from pos p
  left join public.v_targets_active ta on ta.asset_id = p.asset_id
  where p.quantity > 0 or ta.percent is not null
  union all
  select k.user_id, 'class', null, k.class, null,
         coalesce(c.value_brl, 0), coalesce(c.value_usd, 0), tc.percent
  from (
    select user_id, class from pos where quantity > 0
    union
    select user_id, class from public.v_targets_active where class is not null
  ) k
  left join (
    select user_id, class, sum(value_brl) as value_brl, sum(value_usd) as value_usd
    from pos group by user_id, class
  ) c on c.user_id = k.user_id and c.class = k.class
  left join public.v_targets_active tc on tc.user_id = k.user_id and tc.class = k.class
)
select r.user_id, r.kind, r.asset_id, r.class, r.ticker, r.value_brl, r.value_usd,
       case when t.total_brl > 0 then r.value_brl / t.total_brl * 100 else 0 end as current_pct,
       r.target_pct,
       case when t.total_brl > 0 then r.value_brl / t.total_brl * 100 else 0 end - r.target_pct as deviation_pct,
       greatest(r.target_pct / 100 * t.total_brl - r.value_brl, 0) as missing_brl,
       greatest(r.target_pct / 100 * t.total_usd - r.value_usd, 0) as missing_usd
from rows r
join tot t on t.user_id = r.user_id;

grant select on public.v_positions, public.v_targets_active, public.v_allocation to authenticated, service_role;

-- ---------------------------------------------------------------- funções de escrita

-- Substitui o conjunto de metas de hoje. items: [{"asset_id": uuid, "percent": n}] ou [{"class": text, "percent": n}].
-- Linhas com percent 0 são ignoradas; o restante precisa somar exatamente 100.
create function public.set_targets(p_kind text, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  total numeric;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_kind not in ('asset', 'class') then raise exception 'tipo inválido: %', p_kind; end if;

  select coalesce(sum((i->>'percent')::numeric), 0) into total
  from jsonb_array_elements(p_items) i where (i->>'percent')::numeric > 0;
  if total <> 100 then raise exception 'As metas precisam somar 100%% (soma atual: %)', total; end if;

  if p_kind = 'asset' and exists (
    select 1 from jsonb_array_elements(p_items) i
    where not exists (select 1 from public.assets a where a.id = (i->>'asset_id')::uuid and a.user_id = uid)
  ) then raise exception 'ativo inválido'; end if;

  delete from public.targets t
  where t.user_id = uid and t.valid_from = current_date and (t.asset_id is not null) = (p_kind = 'asset');

  insert into public.targets (user_id, asset_id, class, percent, valid_from)
  select uid,
         case when p_kind = 'asset' then (i->>'asset_id')::uuid end,
         case when p_kind = 'class' then (i->>'class')::public.asset_class end,
         (i->>'percent')::numeric, current_date
  from jsonb_array_elements(p_items) i
  where (i->>'percent')::numeric > 0;
end $$;

-- Grava o patrimônio do dia por classe. Chamada só pela Edge Function daily-snapshot.
create function public.take_snapshots()
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  insert into public.snapshots (user_id, date, class, value_brl, value_usd, cost_brl, cost_usd)
  select user_id, (now() at time zone 'America/Sao_Paulo')::date, class,
         sum(value_brl), sum(value_usd), sum(cost_brl), sum(cost_usd)
  from public.v_positions
  where quantity > 0 and value_brl is not null
  group by user_id, class
  on conflict (user_id, date, class) do update
    set value_brl = excluded.value_brl, value_usd = excluded.value_usd,
        cost_brl = excluded.cost_brl, cost_usd = excluded.cost_usd;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.set_targets(text, jsonb) from public, anon;
grant execute on function public.set_targets(text, jsonb) to authenticated;
revoke all on function public.take_snapshots() from public, anon, authenticated;
grant execute on function public.take_snapshots() to service_role;
