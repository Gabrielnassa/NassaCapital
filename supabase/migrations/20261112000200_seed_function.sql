-- Dados iniciais do dono do app (posição de 11/11/2026, metas e plano de DCA).
-- O app chama seed_initial_data() uma vez, depois do primeiro login. Não faz nada se já houver ativos.

create function public.seed_initial_data()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  d0 constant date := date '2026-11-11';
  fx constant numeric := 5.05;
  plan uuid;
  a_btc uuid; a_eth uuid; a_sol uuid; a_avax uuid; a_aave uuid; a_bp uuid; a_cards uuid; a_usdt uuid; a_brl uuid;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if exists (select 1 from public.assets where user_id = uid) then return false; end if;

  insert into public.settings (user_id) values (uid) on conflict do nothing;

  insert into public.brokers (user_id, name)
  values (uid, 'Binance'), (uid, 'Backpack'), (uid, 'Phantom'), (uid, 'Corretora B3');

  -- BP e CARDS: IDs do CoinGecko a confirmar em Ajustes > Ativos.
  insert into public.assets (user_id, ticker, name, class, source, source_id, quote_currency) values
    (uid, 'BTC',   'Bitcoin',         'crypto', 'coingecko', 'bitcoin',         'USD'),
    (uid, 'ETH',   'Ethereum',        'crypto', 'coingecko', 'ethereum',        'USD'),
    (uid, 'SOL',   'Solana',          'crypto', 'coingecko', 'solana',          'USD'),
    (uid, 'AVAX',  'Avalanche',       'crypto', 'coingecko', 'avalanche-2',     'USD'),
    (uid, 'AAVE',  'Aave',            'crypto', 'coingecko', 'aave',            'USD'),
    (uid, 'BP',    'Backpack',        'crypto', 'coingecko', 'backpack',        'USD'),
    (uid, 'CARDS', 'Collector Crypt', 'crypto', 'coingecko', 'collector-crypt', 'USD'),
    (uid, 'USDT',  'Tether',          'stable', 'coingecko', 'tether',          'USD'),
    (uid, 'BRL',   'Reais em caixa',  'cash',   'manual',    null,              'BRL');

  select id into a_btc   from public.assets where user_id = uid and ticker = 'BTC';
  select id into a_eth   from public.assets where user_id = uid and ticker = 'ETH';
  select id into a_sol   from public.assets where user_id = uid and ticker = 'SOL';
  select id into a_avax  from public.assets where user_id = uid and ticker = 'AVAX';
  select id into a_aave  from public.assets where user_id = uid and ticker = 'AAVE';
  select id into a_bp    from public.assets where user_id = uid and ticker = 'BP';
  select id into a_cards from public.assets where user_id = uid and ticker = 'CARDS';
  select id into a_usdt  from public.assets where user_id = uid and ticker = 'USDT';
  select id into a_brl   from public.assets where user_id = uid and ticker = 'BRL';

  -- Posição inicial: entrada (transfer_in) com o valor em USD do dia como custo.
  insert into public.transactions
    (user_id, asset_id, type, date, quantity, unit_price, currency, fx_rate_to_brl, notes) values
    (uid, a_btc,  'transfer_in', d0, 0.00724287,  round(534.42 / 0.00724287, 8),  'USD', fx, 'Posição inicial'),
    (uid, a_sol,  'transfer_in', d0, 4.18749155,  round(346.55 / 4.18749155, 8),  'USD', fx, 'Posição inicial'),
    (uid, a_avax, 'transfer_in', d0, 16.37707821, round(138.63 / 16.37707821, 8), 'USD', fx, 'Posição inicial'),
    (uid, a_usdt, 'transfer_in', d0, 78.84157358, 1,                              'USD', fx, 'Posição inicial'),
    (uid, a_brl,  'transfer_in', d0, 8000.00,     1,                              'BRL', fx, 'Posição inicial');

  -- Metas (AVAX fica fora da meta).
  insert into public.targets (user_id, asset_id, percent, valid_from) values
    (uid, a_btc, 50, d0), (uid, a_usdt, 32.5, d0), (uid, a_sol, 8, d0), (uid, a_eth, 5, d0),
    (uid, a_aave, 2.5, d0), (uid, a_bp, 1, d0), (uid, a_cards, 1, d0);

  -- Plano de DCA: compra em 30 dias só o que falta para a meta. Valores fixos por execução, em USD.
  insert into public.dca_plans (user_id, name, total_amount, source_currency, funding_asset_id, start_date, duration_days)
  values (uid, 'Carteira cripto nov/2026', 1062, 'USD', a_usdt, date '2026-11-12', 30)
  returning id into plan;

  insert into public.dca_plan_items (user_id, plan_id, asset_id, fixed_amount, frequency) values
    (uid, plan, a_btc,   26.90, 'daily'),
    (uid, plan, a_eth,   33.50, 'weekly'),
    (uid, plan, a_aave,  16.75, 'weekly'),
    (uid, plan, a_bp,    27,    'once'),
    (uid, plan, a_cards, 27,    'once');

  -- Execuções: diário = 1 por dia; semanal = a cada 7 dias, floor(duração / 7) vezes; único = no início.
  insert into public.dca_executions (user_id, plan_item_id, scheduled_date, planned_amount)
  select uid, i.id, p.start_date + n * case i.frequency when 'weekly' then 7 else 1 end, i.fixed_amount
  from public.dca_plan_items i
  join public.dca_plans p on p.id = i.plan_id
  cross join lateral generate_series(0, case i.frequency
      when 'daily'  then p.duration_days - 1
      when 'weekly' then greatest(p.duration_days / 7, 1) - 1
      else 0 end) as n
  where i.plan_id = plan;

  return true;
end $$;

revoke all on function public.seed_initial_data() from public, anon;
grant execute on function public.seed_initial_data() to authenticated;
