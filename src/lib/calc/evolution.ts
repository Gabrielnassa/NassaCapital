// Evolução do patrimônio: soma os snapshots diários (um por classe) em um ponto por dia.
import Decimal from 'decimal.js'
import { ZERO, type Dec } from './money'

export interface SnapshotRow {
  date: string
  value: Dec
  cost: Dec
}

export interface EvolutionPoint {
  date: string
  value: Dec
  cost: Dec
  gain: Dec
  gainPct: Dec | null
}

export function evolution(rows: SnapshotRow[]): EvolutionPoint[] {
  const byDate = new Map<string, { value: Dec; cost: Dec }>()
  for (const r of rows) {
    const acc = byDate.get(r.date) ?? { value: ZERO, cost: ZERO }
    byDate.set(r.date, { value: acc.value.plus(r.value), cost: acc.cost.plus(r.cost) })
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { value, cost }]) => ({
      date, value, cost, gain: value.minus(cost), gainPct: cost.gt(0) ? value.div(cost).minus(1).times(100) : null,
    }))
}

/** Marcas "redondas" para o eixo: 3 a 5 valores que cobrem [min, max]. */
export function niceTicks(min: Dec, max: Dec, count = 4): Dec[] {
  if (max.lte(min)) {
    const pad = min.abs().times('0.05').plus(1)
    return niceTicks(min.minus(pad), max.plus(pad), count)
  }
  const rough = max.minus(min).div(count)
  const pow = new Decimal(10).pow(Math.floor(Math.log10(rough.toNumber())))
  const step = [1, 2, 2.5, 5, 10].map((m) => pow.times(m)).find((s) => s.gte(rough))!
  const start = min.div(step).floor().times(step)
  const ticks: Dec[] = []
  for (let v = start; v.lte(max.plus(step.times('0.0001'))) || ticks.length < 2; v = v.plus(step)) ticks.push(v)
  if (ticks.at(-1)!.lt(max)) ticks.push(ticks.at(-1)!.plus(step))
  return ticks
}
