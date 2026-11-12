-- Par na Binance de cada ativo (ex.: BTCUSDT), usado pelo app para o preço ao vivo.
-- É opcional e explícito por ativo: nunca deduzido do ticker, porque tickers se repetem entre tokens.

alter table public.assets
  add column binance_symbol text check (binance_symbol ~ '^[A-Z0-9]{5,20}$');

-- Para as moedas mais conhecidas, identificadas pelo ID do CoinGecko, o par já vem preenchido.
create function public.default_binance_symbol()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.binance_symbol is null and new.source = 'coingecko' then
    new.binance_symbol := case new.source_id
      when 'bitcoin'     then 'BTCUSDT'
      when 'ethereum'    then 'ETHUSDT'
      when 'solana'      then 'SOLUSDT'
      when 'avalanche-2' then 'AVAXUSDT'
      when 'aave'        then 'AAVEUSDT'
    end;
  end if;
  return new;
end $$;

create trigger assets_default_binance_symbol
  before insert on public.assets
  for each row execute function public.default_binance_symbol();

update public.assets set binance_symbol = case source_id
    when 'bitcoin'     then 'BTCUSDT'
    when 'ethereum'    then 'ETHUSDT'
    when 'solana'      then 'SOLUSDT'
    when 'avalanche-2' then 'AVAXUSDT'
    when 'aave'        then 'AAVEUSDT'
  end
where source = 'coingecko' and binance_symbol is null
  and source_id in ('bitcoin', 'ethereum', 'solana', 'avalanche-2', 'aave');
