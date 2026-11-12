-- Preços do servidor a cada 5 minutos (antes, 15). É o limite prático do plano Demo do CoinGecko:
-- 10.000 chamadas por mês; a cada 5 min são cerca de 8.640. A cada 1 min seriam 43.200.
-- O preço ao vivo dos ativos com par na Binance não depende disto: vem direto pelo navegador.
select cron.schedule('update-prices', '*/5 * * * *', $$select public.call_edge_function('update-prices')$$);
