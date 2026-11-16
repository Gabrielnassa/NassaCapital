// Conferência de saldos: o dono digita a quantidade que a corretora mostra e o app calcula o ajuste.
// Campo vazio = não conferir esse ativo (ex.: um token que está em outra carteira).
import { D, type Dec } from './money'

export interface Holding {
  id: string
  quantity: Dec
}

export interface Adjustment {
  id: string
  /** positivo = entrada (rendimento, depósito), negativo = saída */
  diff: Dec
}

/** Quantidades com até 8 casas, como as corretoras mostram; diferença menor que isso é ruído. */
const DUST = D('0.000000005')

export function reconcile(holdings: Holding[], reported: Map<string, Dec>): Adjustment[] {
  return holdings.flatMap((h) => {
    const r = reported.get(h.id)
    if (!r) return []
    const diff = r.minus(h.quantity)
    return diff.abs().lt(DUST) ? [] : [{ id: h.id, diff }]
  })
}
