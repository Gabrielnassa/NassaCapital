-- Testes de banco: seed, views, preço médio, metas e RLS. Qualquer falha aborta com erro.
\set ON_ERROR_STOP on

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'a@test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test');

create schema t;
create function t.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
$$;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant usage on schema t to anon, authenticated, service_role;

-- ---------- usuário A carrega o seed
select t.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;

select t.ok(public.seed_initial_data(), 'seed roda na primeira vez');
select t.ok(not public.seed_initial_data(), 'seed não duplica');
select t.ok((select count(*) from assets) = 9, '9 ativos');
select t.ok((select sum(percent) from v_targets_active) = 100, 'metas ativas somam 100%');
select t.ok((select binance_symbol from assets where ticker = 'BTC') = 'BTCUSDT', 'BTC recebe o par BTCUSDT');
select t.ok((select count(*) from assets where binance_symbol is not null) = 5 and (select binance_symbol is null from assets where ticker = 'BP'), 'só as 5 moedas conhecidas recebem par; BP fica sem');

select t.ok((select round(sum(value_usd), 2) from v_positions) = 2682.60,
  'patrimônio do seed = US$ 2.682,60 (534,42 + 346,55 + 138,63 + 78,84 + 8000/5,05)');
select t.ok((select round(cost, 2) from v_positions where ticker = 'BTC') = 534.42, 'custo BTC = 534,42');
select t.ok((select price_origin from v_positions where ticker = 'BTC') = 'last_tx', 'sem cotação usa último lançamento');
select t.ok((select round(value_brl, 2) from v_positions where ticker = 'BRL') = 8000.00, 'caixa BRL = R$ 8.000');
select t.ok((select target_pct is null from v_allocation where ticker = 'AVAX'), 'AVAX fora da meta');
select t.ok((select round(missing_usd, 0) from v_allocation where ticker = 'BTC') = 807, 'falta US$ 807 de BTC');
select t.ok((select round(missing_usd, 0) from v_allocation where ticker = 'ETH') = 134, 'falta US$ 134 de ETH');
select t.ok((select missing_usd from v_allocation where ticker = 'SOL') = 0, 'SOL acima da meta: falta 0');
select t.ok((select round(sum(current_pct), 6) from v_allocation where kind = 'asset') = 100, '% atual soma 100');
select t.ok((select count(*) from v_allocation where kind = 'class') = 3, '3 classes com posição');

-- DCA do seed
select t.ok((select count(*) from dca_executions) = 30 + 4 + 4 + 1 + 1, '40 execuções geradas');
select t.ok((select sum(planned_amount) from dca_executions) = 1062.00, 'execuções somam US$ 1.062');
select t.ok((select max(e.scheduled_date) from dca_executions e join dca_plan_items i on i.id = e.plan_item_id
                   where i.frequency = 'weekly') = date '2026-12-03', 'última semanal em 03/12');

-- ---------- preço médio: compra com taxa, venda não muda o médio, moeda diferente da cotação
insert into assets (ticker, name, class, source, source_id, quote_currency)
values ('PETR4', 'Petrobras PN', 'stock', 'brapi', 'PETR4', 'BRL');
insert into transactions (asset_id, type, date, quantity, unit_price, fee, currency, fx_rate_to_brl)
select id, 'buy', date '2026-01-10', 100, 30, 5, 'BRL', 5 from assets where ticker = 'PETR4';
insert into transactions (asset_id, type, date, quantity, unit_price, fee, currency, fx_rate_to_brl)
select id, 'buy', date '2026-02-10', 100, 40, 5, 'BRL', 5 from assets where ticker = 'PETR4';
select t.ok((select avg_price from v_positions where ticker = 'PETR4') = 35.05, 'PM = (3005 + 4005) / 200 = 35,05');
insert into transactions (asset_id, type, date, quantity, unit_price, fee, currency, fx_rate_to_brl)
select id, 'sell', date '2026-03-10', 50, 50, 5, 'BRL', 5 from assets where ticker = 'PETR4';
select t.ok((select avg_price = 35.05 and quantity = 150 from v_positions where ticker = 'PETR4'),
  'venda reduz quantidade e mantém o PM');
-- compra de BTC paga em reais: custo convertido pelo câmbio do dia
insert into transactions (asset_id, type, date, quantity, unit_price, fee, currency, fx_rate_to_brl)
select id, 'buy', date '2026-11-12', 0.00724287, 400000, 0, 'BRL', 5 from assets where ticker = 'BTC';
select t.ok((select round(cost, 2) from v_positions where ticker = 'BTC') = round(534.42 + 0.00724287 * 400000 / 5, 2),
  'compra em BRL de ativo cotado em USD converte pelo câmbio do dia');

-- ---------- execução de DCA acompanha o lançamento
with e as (select e.id, i.asset_id from dca_executions e join dca_plan_items i on i.id = e.plan_item_id
           join assets a on a.id = i.asset_id where a.ticker = 'ETH' order by e.scheduled_date limit 1)
insert into transactions (asset_id, type, date, quantity, unit_price, currency, fx_rate_to_brl, dca_execution_id)
select asset_id, 'buy', date '2026-11-12', 0.01629811, 2055.45, 'USD', 5.6, id from e;
select t.ok((select count(*) from dca_executions e join transactions x on x.id = e.transaction_id where e.status = 'done') = 1,
  'lançamento com execução marca a execução como feita e liga os dois');
delete from transactions where dca_execution_id is not null;
select t.ok((select count(*) from dca_executions where status <> 'pending' or transaction_id is not null) = 0,
  'excluir o lançamento devolve a execução para pendente');

-- ---------- mesma data e mesmo instante: entrada antes da saída
insert into assets (ticker, name, class, source, source_id, quote_currency) values ('USDC', 'USD Coin', 'stable', 'coingecko', 'usd-coin', 'USD');
insert into transactions (asset_id, type, date, quantity, unit_price, currency, fx_rate_to_brl, created_at, id)
select id, 'sell'::tx_type, date '2026-11-13', 26.9, 1, 'USD', 5.6, timestamptz '2026-11-13 12:00', uuid '00000000-0000-0000-0000-000000000001' from assets where ticker = 'USDC'
union all
select id, 'buy'::tx_type, date '2026-11-13', 1421.25, 1.001, 'USD', 5.6, timestamptz '2026-11-13 12:00', uuid 'ffffffff-ffff-ffff-ffff-ffffffffffff' from assets where ticker = 'USDC';
select t.ok((select quantity = 1394.35 and avg_price = 1.001 from v_positions where ticker = 'USDC'),
  'lançamentos no mesmo instante: a entrada conta antes da saída, mesmo com id menor na saída');

-- ---------- investido em reais pelo câmbio de cada lançamento
insert into assets (ticker, name, class, source, source_id, quote_currency) values ('USDX', 'Dólar teste', 'stable', 'manual', null, 'USD');
insert into transactions (asset_id, type, date, quantity, unit_price, currency, fx_rate_to_brl)
select id, 'buy', date '2026-11-20', 1421, 8000.0 / 1421, 'BRL', 5.63 from assets where ticker = 'USDX';
-- lançamento posterior com câmbio 5,79: vira o câmbio "atual" (não há cotação gravada no teste)
insert into transactions (asset_id, type, date, quantity, unit_price, currency, fx_rate_to_brl)
select id, 'buy', date '2026-11-21', 1, 1, 'USD', 5.79 from assets where ticker = 'USDX';
select t.ok((select round(cost_brl, 2) = round(8000 + 5.79, 2) from v_positions where ticker = 'USDX'),
  'investido em reais usa o câmbio de cada compra (R$ 8.000 a 5,63 + US$ 1 a 5,79), não o de hoje');
select t.ok((select round(cost_usd, 2) = round(8000 / 5.63 + 1, 2) from v_positions where ticker = 'USDX'),
  'investido em dólar também pelo câmbio de cada compra');
select t.ok((select round(value_brl, 2) = round(1422 * 5.79, 2) from v_positions where ticker = 'USDX'),
  'valor em reais continua pelo câmbio de hoje');
insert into transactions (asset_id, type, date, quantity, unit_price, currency, fx_rate_to_brl)
select id, 'sell', date '2026-11-22', 711, 1, 'USD', 5.79 from assets where ticker = 'USDX';
select t.ok((select round(cost_brl, 4) = round((8000 + 5.79) / 1422 * 711, 4) from v_positions where ticker = 'USDX'),
  'venda reduz o investido em reais na proporção, sem mudar o preço médio');

-- ---------- rendimento: entra sem custo e fica separado
insert into transactions (asset_id, type, date, quantity, unit_price, currency, fx_rate_to_brl)
select id, 'reward', date '2026-11-22', 0.5, 0, 'USD', 5.79 from assets where ticker = 'USDX';
select t.ok((select quantity = 711.5 and reward_qty = 0.5 and round(cost_brl, 4) = round((8000 + 5.79) / 1422 * 711, 4) from v_positions where ticker = 'USDX'),
  'rendimento aumenta a quantidade, não muda o investido e aparece em reward_qty');

-- ---------- metas: validação de 100% e escrita só pela função
do $$ begin
  begin
    perform public.set_targets('asset', (select jsonb_agg(jsonb_build_object('asset_id', id, 'percent', 9)) from assets));
    raise exception 'FALHOU: aceitou metas que não somam 100';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok - set_targets recusa soma diferente de 100';
  end;
  begin
    insert into targets (asset_id, percent) select id, 1 from assets limit 1;
    raise exception 'FALHOU: insert direto em targets passou';
  exception when insufficient_privilege then
    raise notice 'ok - insert direto em targets é negado';
  end;
  begin
    insert into prices (user_id, asset_id, price, currency, source_ts)
    select user_id, id, 1, 'USD', now() from assets limit 1;
    raise exception 'FALHOU: usuário gravou em prices';
  exception when insufficient_privilege then
    raise notice 'ok - usuário não grava em prices';
  end;
end $$;
select public.set_targets('class', '[{"class":"crypto","percent":60},{"class":"stable","percent":40},{"class":"cash","percent":0}]');
select t.ok((select count(*) from v_targets_active where class is not null) = 2, 'metas por classe gravadas');
select t.ok((select sum(percent) from v_targets_active where asset_id is not null) = 100, 'metas por ativo intactas');

-- ---------- lembrete: inscrição do aparelho e hora
insert into push_subscriptions (endpoint, p256dh, auth) values ('https://web.push.apple.com/abc', 'p', 'a');
insert into settings (user_id, reminder_hour) values ('00000000-0000-0000-0000-00000000000a', 10)
  on conflict (user_id) do update set reminder_hour = excluded.reminder_hour;
select t.ok((select reminder_hour from settings) = 10, 'hora do lembrete gravada');
do $$ begin
  update settings set reminder_hour = 24;
  raise exception 'FALHOU: aceitou hora 24';
exception when check_violation then
  raise notice 'ok - hora do lembrete só de 0 a 23';
end $$;
do $$ begin
  perform public.vapid_private_jwk();
  raise exception 'FALHOU: usuário leu a chave privada do push';
exception when insufficient_privilege then
  raise notice 'ok - usuário não lê a chave privada do push';
end $$;

-- ---------- RLS: B não enxerga nem altera nada de A
select t.login('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from assets) = 0, 'B não lê assets de A');
select t.ok((select count(*) from transactions) = 0, 'B não lê transactions de A');
select t.ok((select count(*) from targets) = 0, 'B não lê targets de A');
select t.ok((select count(*) from dca_plans) + (select count(*) from dca_plan_items)
                + (select count(*) from dca_executions) = 0, 'B não lê DCA de A');
select t.ok((select count(*) from v_positions) + (select count(*) from v_allocation) = 0, 'B não lê as views de A');
select t.ok((select count(*) from push_subscriptions) = 0, 'B não lê as inscrições de push de A');
with u as (update transactions set quantity = 1 returning 1) select t.ok((select count(*) from u) = 0, 'B não altera transactions de A');
with d as (delete from assets returning 1) select t.ok((select count(*) from d) = 0, 'B não apaga assets de A');
do $$ begin
  insert into brokers (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'invasor');
  raise exception 'FALHOU: B inseriu linha com user_id de A';
exception when insufficient_privilege then
  raise notice 'ok - B não insere com user_id de A';
end $$;

-- ---------- anônimo não lê nada; snapshot só pelo service_role
reset role;
set role anon;
do $$ begin
  perform count(*) from public.assets;
  raise exception 'FALHOU: anon leu assets';
exception when insufficient_privilege then
  raise notice 'ok - anon sem acesso';
end $$;
reset role;
set role service_role;
select t.ok(public.take_snapshots() = 4, 'snapshot grava 4 classes de A');
update snapshots set cost_brl = 1, cost_usd = 1;
select t.ok(public.recompute_snapshot_costs() = 4, 'recálculo do custo atualiza os 4 snapshots');
select t.ok((select bool_and(cost_brl > 1 and cost_usd > 1) from snapshots), 'custo dos snapshots é recalculado pela regra histórica');
select t.ok(public.take_snapshots() = 4, 'snapshot do mesmo dia atualiza, sem duplicar');
select t.ok((select count(*) from snapshots) = 4, '4 linhas em snapshots');
reset role;
\echo TODOS OS TESTES DE BANCO PASSARAM
