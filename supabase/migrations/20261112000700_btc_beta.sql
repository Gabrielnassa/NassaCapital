-- Multiplicador do simulador de cenário, por ativo: quanto ele se move para cada 1% do Bitcoin.
-- Nulo = usa o padrão do app (Bitcoin 1, altcoin 1,5, demais 0).
alter table public.assets
  add column btc_beta numeric check (btc_beta >= 0 and btc_beta <= 10);
