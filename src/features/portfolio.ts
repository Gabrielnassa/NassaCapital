// Derivações de tela a partir das views: totais, variação do dia e execuções de DCA em aberto.
import { splitDue } from '../lib/calc/dca'
import { convert, D, sum, ZERO, type Ccy, type Dec } from '../lib/calc/money'
import type { Asset, Execution, Plan, PlanItem, Position } from '../lib/data'

export interface Totals {
  brl: Dec
  usd: Dec
  usdBrl: Dec | null
  /** variação do dia somando a variação de 24h de cada ativo; null se nenhum ativo tem cotação */
  dayBrl: Dec | null
  dayUsd: Dec | null
  dayPct: Dec | null
}

export function totals(positions: Position[]): Totals {
  const brl = sum(positions.map((p) => p.value_brl ?? ZERO))
  const usd = sum(positions.map((p) => p.value_usd ?? ZERO))
  const quoted = positions.filter((p) => p.change_pct_24h && p.value_brl && p.value_usd)
  const gain = (v: Dec, pct: Dec) => v.minus(v.div(D(1).plus(pct.div(100))))
  const dayBrl = quoted.length ? sum(quoted.map((p) => gain(p.value_brl!, p.change_pct_24h!))) : null
  const dayUsd = quoted.length ? sum(quoted.map((p) => gain(p.value_usd!, p.change_pct_24h!))) : null
  const before = dayBrl ? brl.minus(dayBrl) : null
  return {
    brl, usd, dayBrl, dayUsd,
    usdBrl: positions.find((p) => p.usd_brl)?.usd_brl ?? null,
    dayPct: dayBrl && before?.gt(0) ? dayBrl.div(before).times(100) : null,
  }
}

export interface OpenExecution {
  execution: Execution
  item: PlanItem
  plan: Plan
  asset: Asset | undefined
  position: Position | undefined
  status: Execution['status']
  scheduledDate: string
  planStatus: Plan['status']
  amountBrl: Dec | null
  amountUsd: Dec | null
  /** quantidade estimada pelo preço atual */
  estimatedQty: Dec | null
}

export function openExecutions(plans: Plan[], assets: Asset[], positions: Position[], today: string) {
  const usdBrl = positions.find((p) => p.usd_brl)?.usd_brl ?? null
  const all: OpenExecution[] = plans.flatMap((plan) =>
    plan.items.flatMap((item) =>
      item.executions.map((execution) => {
        const position = positions.find((p) => p.asset_id === item.asset_id)
        const to = (ccy: Ccy) => (usdBrl ? convert(execution.planned_amount, plan.source_currency, ccy, usdBrl) : plan.source_currency === ccy ? execution.planned_amount : null)
        const inQuote = position ? to(position.quote_currency) : null
        return {
          execution, item, plan, position,
          asset: assets.find((a) => a.id === item.asset_id),
          status: execution.status, scheduledDate: execution.scheduled_date, planStatus: plan.status,
          amountBrl: to('BRL'), amountUsd: to('USD'),
          estimatedQty: inQuote && position?.price?.gt(0) ? inQuote.div(position.price) : null,
        }
      }),
    ),
  )
  return splitDue(all, today)
}

/** Executado vs planejado de um plano, na moeda do plano. */
export function planProgress(plan: Plan) {
  const all = plan.items.flatMap((i) => i.executions)
  const done = all.filter((e) => e.status === 'done')
  return {
    planned: sum(all.filter((e) => e.status !== 'skipped').map((e) => e.planned_amount)),
    executed: sum(done.map((e) => e.planned_amount)),
    doneCount: done.length,
    count: all.length,
    skipped: all.filter((e) => e.status === 'skipped').length,
  }
}
