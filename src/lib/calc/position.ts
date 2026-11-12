import { convert, ZERO, type Ccy, type Dec } from './money'

export type TxType = 'buy' | 'sell' | 'transfer_in' | 'transfer_out'

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
}

/**
 * Preço médio ponderado (mesma regra da view v_positions).
 * Compra e entrada somam o custo, com a taxa. Venda e saída só reduzem a quantidade.
 * Posição zerada reinicia o preço médio. Os lançamentos devem vir em ordem cronológica.
 */
export function computePosition(txs: TxInput[], quoteCurrency: Ccy): Position {
  let qty = ZERO
  let avg = ZERO
  for (const t of txs) {
    if (t.type === 'buy' || t.type === 'transfer_in') {
      const cost = convert(t.quantity.times(t.unitPrice).plus(t.fee), t.currency, quoteCurrency, t.fxRateToBrl)
      const newQty = qty.plus(t.quantity)
      avg = qty.times(avg).plus(cost).div(newQty)
      qty = newQty
    } else if (qty.minus(t.quantity).lte(0)) {
      qty = ZERO
      avg = ZERO
    } else {
      qty = qty.minus(t.quantity)
    }
  }
  return { quantity: qty, avgPrice: avg, cost: qty.times(avg) }
}
