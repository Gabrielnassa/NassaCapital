import { convert, ZERO, type Ccy, type Dec } from './money'

export type TxType = 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'reward'

export interface TxInput {
  type: TxType
  quantity: Dec
  unitPrice: Dec
  fee: Dec
  currency: Ccy
  /** R$ por US$ 1 no dia do lançamento */
  fxRateToBrl: Dec
}

export interface Position {
  quantity: Dec
  /** preço médio na moeda de cotação do ativo */
  avgPrice: Dec
  cost: Dec
  /** investido em reais, cada lançamento convertido pelo câmbio do dia dele */
  costBrl: Dec
  /** investido em dólar, idem */
  costUsd: Dec
}

const isIn = (t: TxType) => t === 'buy' || t === 'transfer_in' || t === 'reward'

/**
 * Preço médio ponderado (mesma regra da view v_positions).
 * Compra, entrada e rendimento somam o custo, com a taxa (rendimento costuma vir com preço 0).
 * Venda e saída só reduzem a quantidade. Posição zerada reinicia o preço médio.
 * O mesmo cálculo é feito em três moedas: a de cotação, BRL e USD, sempre pelo câmbio de cada
 * lançamento, e nunca pelo de hoje. Os lançamentos devem vir em ordem cronológica, com entradas antes
 * de saídas no mesmo instante.
 */
export function computePosition(txs: TxInput[], quoteCurrency: Ccy): Position {
  let qty = ZERO
  const avg = { quote: ZERO, BRL: ZERO, USD: ZERO }
  for (const t of txs) {
    if (isIn(t.type)) {
      const paid = t.quantity.times(t.unitPrice).plus(t.fee)
      const newQty = qty.plus(t.quantity)
      const step = (prev: Dec, ccy: Ccy) => qty.times(prev).plus(convert(paid, t.currency, ccy, t.fxRateToBrl)).div(newQty)
      avg.quote = step(avg.quote, quoteCurrency)
      avg.BRL = step(avg.BRL, 'BRL')
      avg.USD = step(avg.USD, 'USD')
      qty = newQty
    } else if (qty.minus(t.quantity).lte(0)) {
      qty = ZERO
      avg.quote = avg.BRL = avg.USD = ZERO
    } else {
      qty = qty.minus(t.quantity)
    }
  }
  return { quantity: qty, avgPrice: avg.quote, cost: qty.times(avg.quote), costBrl: qty.times(avg.BRL), costUsd: qty.times(avg.USD) }
}
