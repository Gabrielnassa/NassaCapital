-- Novo tipo de lançamento: rendimento (ex.: Binance Earn). Entra sem custo, como uma entrada, mas
-- fica separado das correções de saldo. Arquivo próprio: valor novo de enum não pode ser usado na
-- mesma transação em que é criado.
alter type public.tx_type add value if not exists 'reward';
