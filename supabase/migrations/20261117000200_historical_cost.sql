-- 1. Investido em reais e em dólar pelo câmbio de cada lançamento (antes: custo × câmbio de hoje).
--    O preço médio ponderado é calculado três vezes com o mesmo agregado avg_cost: na moeda de
--    cotação (como antes), em BRL e em USD, sempre convertendo cada lançamento pelo câmbio dele.
-- 2. Rendimento (reward) conta como entrada sem custo; v_positions ganha reward_qty.
-- 3. Os lançamentos de rendimento do Earn que entraram como "Ajuste de saldo" viram reward.
-- 4. O custo dos snapshots já gravados é recalculado pela regra nova.

create or replace function public.avg_cost_step(s public.cost_state, t public.tx_type, q numeric, cost numeric)
returns public.cost_state language sql immutable as $$
  select case
    when t in ('buy', 'transfer_in', 'reward') then
      row(s.qty + q, (s.qty * s.avg + cost) / (s.qty + q))::public.cost_state
    when s.qty - q <= 0 then row(0, 0)::public.cost_state
    else row(s.qty - q, s.avg)::public.cost_state
  end
$$;

create or replace view public.v_positions with (security_invoker = true) as
with pos as (
  select t.asset_id,
         public.avg_cost(t.type, t.quantity,
           public.convert_ccy(t.quantity * t.unit_price + t.fee, t.currency, a.quote_currency, t.fx_rate_to_brl)
           order by t.date, t.created_at, (t.type in ('sell', 'transfer_out')), t.id) as st,
         public.avg_cost(t.type, t.quantity,
           public.convert_ccy(t.quantity * t.unit_price + t.fee, t.currency, 'BRL', t.fx_rate_to_brl)
           order by t.date, t.created_at, (t.type in ('sell', 'transfer_out')), t.id) as st_brl,
         public.avg_cost(t.type, t.quantity,
           public.convert_ccy(t.quantity * t.unit_price + t.fee, t.currency, 'USD', t.fx_rate_to_brl)
           order by t.date, t.created_at, (t.type in ('sell', 'transfer_out')), t.id) as st_usd,
         sum(t.quantity) filter (where t.type = 'reward') as reward_qty
  from public.transactions t
  join public.assets a on a.id = t.asset_id
  group by t.asset_id
),
base as (
  select a.user_id, a.id as asset_id, a.ticker, a.name, a.class, a.source, a.quote_currency,
         coalesce((pos.st).qty, 0) as quantity,
         coalesce((pos.st).avg, 0) as avg_price,
         coalesce((pos.st_brl).avg, 0) as avg_brl,
         coalesce((pos.st_usd).avg, 0) as avg_usd,
         coalesce(pos.reward_qty, 0) as reward_qty,
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
       b.quantity * b.avg_brl as cost_brl,
       b.quantity * b.avg_usd as cost_usd,
       b.reward_qty
from base b;

-- Rendimentos do Binance Earn lançados como ajuste de saldo (entrada sem custo).
update public.transactions
   set type = 'reward', notes = 'Rendimento (Binance Earn)'
 where type = 'transfer_in' and unit_price = 0 and notes like 'Ajuste de saldo conforme%';

-- Recalcula o custo dos snapshots gravados com a regra antiga: custo histórico dos lançamentos até a data.
create function public.recompute_snapshot_costs()
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  with pos as (
    select s.user_id, s.date, a.class,
           public.avg_cost(t.type, t.quantity,
             public.convert_ccy(t.quantity * t.unit_price + t.fee, t.currency, 'BRL', t.fx_rate_to_brl)
             order by t.date, t.created_at, (t.type in ('sell', 'transfer_out')), t.id) as st_brl,
           public.avg_cost(t.type, t.quantity,
             public.convert_ccy(t.quantity * t.unit_price + t.fee, t.currency, 'USD', t.fx_rate_to_brl)
             order by t.date, t.created_at, (t.type in ('sell', 'transfer_out')), t.id) as st_usd
    from (select distinct user_id, date from public.snapshots) s
    join public.transactions t on t.user_id = s.user_id and t.date <= s.date
    join public.assets a on a.id = t.asset_id
    group by s.user_id, s.date, a.class, t.asset_id
  ),
  agg as (
    select user_id, date, class,
           sum((st_brl).qty * (st_brl).avg) as cost_brl, sum((st_usd).qty * (st_usd).avg) as cost_usd
    from pos group by user_id, date, class
  )
  update public.snapshots sn
     set cost_brl = agg.cost_brl, cost_usd = agg.cost_usd
    from agg
   where sn.user_id = agg.user_id and sn.date = agg.date and sn.class = agg.class;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.recompute_snapshot_costs() from public, anon, authenticated;
grant execute on function public.recompute_snapshot_costs() to service_role;

select public.recompute_snapshot_costs();
