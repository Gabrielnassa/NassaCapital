import Decimal from 'decimal.js'
import { sum, ZERO, type Dec } from './money'

export interface Holding {
  id: string
  /** valor atual, na mesma moeda do aporte */
  value: Dec
  /** meta em % (0 a 100); null = fora da meta */
  targetPct: Dec | null
}

export interface Suggestion {
  id: string
  amount: Dec
}

/** Quanto falta para cada ativo chegar na meta, sobre um patrimônio total dado. Nunca negativo. */
export function deficits(holdings: Holding[], total: Dec): Map<string, Dec> {
  const out = new Map<string, Dec>()
  for (const h of holdings) {
    if (!h.targetPct || h.targetPct.lte(0)) continue
    const gap = h.targetPct.div(100).times(total).minus(h.value)
    if (gap.gt(0)) out.set(h.id, gap)
  }
  return out
}

/** Divide `amount` proporcionalmente aos pesos, em centavos, somando exatamente `amount`. */
export function splitProportional(amount: Dec, weights: Map<string, Dec>): Suggestion[] {
  const totalWeight = sum([...weights.values()])
  if (amount.lte(0) || totalWeight.lte(0)) return []
  const rows = [...weights.entries()]
    .filter(([, w]) => w.gt(0))
    .map(([id, w]) => ({ id, w, amount: amount.times(w).div(totalWeight).toDecimalPlaces(2, Decimal.ROUND_DOWN) }))
  // Os centavos que sobram do arredondamento vão, um a um, para os maiores pesos.
  let cents = amount.minus(sum(rows.map((r) => r.amount))).times(100).round().toNumber()
  const byWeight = [...rows].sort((a, b) => b.w.cmp(a.w) || a.id.localeCompare(b.id))
  for (let i = 0; cents > 0; i = (i + 1) % byWeight.length, cents--) {
    byWeight[i].amount = byWeight[i].amount.plus('0.01')
  }
  return rows.filter((r) => r.amount.gt(0)).map(({ id, amount }) => ({ id, amount }))
}

/**
 * Simulador de aporte: calcula o alvo de cada ativo sobre (patrimônio + aporte), considera só os
 * que estão abaixo da meta e divide o aporte proporcionalmente ao que falta. Nunca sugere venda,
 * e a soma sugerida é exatamente o aporte.
 */
export function simulateContribution(holdings: Holding[], amount: Dec): Suggestion[] {
  if (amount.lte(0)) return []
  const total = sum(holdings.map((h) => h.value)).plus(amount)
  return splitProportional(amount, deficits(holdings, total))
}

export { ZERO }
