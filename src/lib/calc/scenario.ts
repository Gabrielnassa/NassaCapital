// Simulador de cenário: "se o BTC chegar a tanto, quanto vale a carteira?".
// É conta de hipótese, não previsão: cada ativo se move (multiplicador × variação do BTC).
import Decimal from 'decimal.js'
import { sum, ZERO, type Dec } from './money'

export interface ScenarioHolding {
  id: string
  /** valor atual, em qualquer moeda (todas as linhas na mesma) */
  value: Dec
  /** quanto o ativo se move para cada 1% do BTC: 1 = igual, 1,5 = uma vez e meia, 0 = não se move */
  beta: Dec
}

export interface ScenarioRow {
  id: string
  beta: Dec
  /** variação aplicada ao ativo, em % (nunca abaixo de −100) */
  changePct: Dec
  valueNow: Dec
  valueThen: Dec
  gain: Dec
  /** participação na carteira depois do cenário, em % */
  shareThen: Dec
}

export interface Scenario {
  btcChangePct: Dec
  rows: ScenarioRow[]
  totalNow: Dec
  totalThen: Dec
  gain: Dec
  gainPct: Dec | null
}

const MINUS_100 = new Decimal(-100)

/** Variação do BTC em % entre o preço de hoje e o preço-alvo. */
export function btcChangePct(btcNow: Dec, btcTarget: Dec): Dec {
  if (!btcNow.gt(0)) throw new Error('preço atual do BTC inválido')
  return btcTarget.div(btcNow).minus(1).times(100)
}

/** Aplica a variação do BTC a cada ativo pelo multiplicador. Nenhum ativo perde mais de 100%. */
export function simulateScenario(holdings: ScenarioHolding[], changePct: Dec): Scenario {
  const partial = holdings.map((h) => {
    const applied = Decimal.max(changePct.times(h.beta), MINUS_100)
    const valueThen = h.value.times(applied.div(100).plus(1))
    return { id: h.id, beta: h.beta, changePct: applied, valueNow: h.value, valueThen, gain: valueThen.minus(h.value) }
  })
  const totalNow = sum(partial.map((r) => r.valueNow))
  const totalThen = sum(partial.map((r) => r.valueThen))
  return {
    btcChangePct: changePct,
    rows: partial.map((r) => ({ ...r, shareThen: totalThen.gt(0) ? r.valueThen.div(totalThen).times(100) : ZERO })),
    totalNow,
    totalThen,
    gain: totalThen.minus(totalNow),
    gainPct: totalNow.gt(0) ? totalThen.div(totalNow).minus(1).times(100) : null,
  }
}

/**
 * Conta inversa: que variação do BTC leva a carteira a um patrimônio-alvo?
 * total = Σ valor × (1 + multiplicador × variação)  →  variação = (alvo − total) ÷ Σ(valor × multiplicador).
 * Devolve null quando nada na carteira acompanha o BTC, ou quando o alvo exigiria queda maior que 100%.
 */
export function btcChangeForTotal(holdings: ScenarioHolding[], targetTotal: Dec): Dec | null {
  const total = sum(holdings.map((h) => h.value))
  const exposure = sum(holdings.map((h) => h.value.times(h.beta)))
  if (!exposure.gt(0)) return null
  const change = targetTotal.minus(total).div(exposure).times(100)
  // Abaixo de −100% ÷ maior multiplicador a conta deixa de ser linear (ativos zeram); não respondemos.
  const maxBeta = Decimal.max(...holdings.map((h) => h.beta))
  return change.lt(MINUS_100.div(maxBeta)) ? null : change
}
