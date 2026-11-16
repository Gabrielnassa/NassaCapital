-- Lançamentos do mesmo ativo, no mesmo dia e no mesmo instante (ex.: entrada de uma conversão e
-- saída de um pagamento gravados juntos) eram ordenados pelo id, que é aleatório: a saída podia vir
-- antes da entrada, zerar a posição e reiniciar o preço médio. Agora entradas vêm antes de saídas.
create or replace view public.v_positions with (security_invoker = true) as
with pos as (
  select t.asset_id,
         public.avg_cost(t.type, t.quantity,
           public.convert_ccy(t.quantity * t.unit_price + t.fee, t.currency, a.quote_currency, t.fx_rate_to_brl)
           order by t.date, t.created_at, (t.type in ('sell', 'transfer_out')), t.id) as st
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
