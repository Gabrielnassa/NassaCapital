import Decimal from 'decimal.js'
import { deficits, type Holding } from './contribution'
import { sum, toCents, ZERO, type Dec } from './money'

export type Frequency = 'daily' | 'weekly' | 'once'

export interface PlanItemInput {
  frequency: Frequency
  /** % do total do plano (0 a 100). Um dos dois: percent ou fixedAmount. */
  percent?: Dec | null
  /** valor fixo por execução */
  fixedAmount?: Dec | null
}

export interface PlannedExecution {
  /** AAAA-MM-DD */
  date: string
  amount: Dec
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Diário: uma por dia. Semanal: a cada 7 dias, floor(duração / 7) vezes (mínimo 1). Único: uma. */
export function executionCount(frequency: Frequency, durationDays: number): number {
  if (frequency === 'daily') return durationDays
  if (frequency === 'weekly') return Math.max(Math.floor(durationDays / 7), 1)
  return 1
}

/**
 * Execuções de um item do plano. Com percentual: total × % ÷ nº de execuções (um item semanal
 * recebe, assim, 7 dias de valor por execução); o resíduo de centavos cai na última, para a soma
 * fechar com total × %. Com valor fixo: o mesmo valor em toda execução.
 */
export function generateExecutions(
  item: PlanItemInput,
  planTotal: Dec,
  startDate: string,
  durationDays: number,
): PlannedExecution[] {
  const n = executionCount(item.frequency, durationDays)
  const step = item.frequency === 'weekly' ? 7 : 1
  const hasPercent = item.percent != null
  if (hasPercent === (item.fixedAmount != null)) throw new Error('informe percentual ou valor fixo, não os dois')

  const itemTotal = hasPercent ? toCents(planTotal.times(item.percent!).div(100)) : toCents(item.fixedAmount!).times(n)
  const each = hasPercent ? itemTotal.div(n).toDecimalPlaces(2, Decimal.ROUND_DOWN) : toCents(item.fixedAmount!)
  return Array.from({ length: n }, (_, i) => ({
    date: addDays(startDate, i * step),
    amount: i === n - 1 ? itemTotal.minus(each.times(n - 1)) : each,
  }))
}

export interface DueExecution {
  status: 'pending' | 'done' | 'skipped'
  scheduledDate: string
  planStatus: 'active' | 'paused' | 'done'
}

/** Separa o que comprar hoje do que ficou para trás. Execução não feita em dia passado continua pendente. */
export function splitDue<T extends DueExecution>(executions: T[], today: string): { today: T[]; overdue: T[] } {
  const open = executions.filter((e) => e.status === 'pending' && e.planStatus === 'active')
  return {
    today: open.filter((e) => e.scheduledDate === today),
    overdue: open.filter((e) => e.scheduledDate < today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
  }
}

export interface DeficitHolding extends Holding {
  /** caixa e stablecoin não entram como compra: são a origem e a reserva do plano */
  isCashLike: boolean
  /** true só para caixa (classe cash), que fica inteiro disponível para o plano */
  isCash: boolean
}

export interface GeneratedItem {
  id: string
  frequency: Frequency
  fixedAmount: Dec
  executions: number
  total: Dec
}

export interface GeneratedPlan {
  items: GeneratedItem[]
  total: Dec
  /** dinheiro disponível: caixa mais o que as stablecoins têm acima da própria meta */
  cash: Dec
  /** quanto do disponível sobra depois do plano */
  reserve: Dec
}

/**
 * "Gerar plano pelo que falta": pega o dinheiro disponível, calcula o que falta de cada ativo para
 * a meta (sobre o patrimônio atual) e monta os itens. Disponível = todo o caixa + a parte das
 * stablecoins que passa da meta delas (stablecoin sem meta conta inteira); a parte dentro da meta é
 * reserva e não é gasta. Se o disponível não cobre tudo, reduz na mesma proporção. Execução abaixo
 * do mínimo de ordem vira semanal; se ainda ficar abaixo, compra única.
 */
export function generatePlanFromDeficit(
  holdings: DeficitHolding[],
  durationDays: number,
  minOrder: Dec,
): GeneratedPlan {
  const total = sum(holdings.map((h) => h.value))
  const cash = sum(
    holdings.filter((h) => h.isCashLike).map((h) => {
      if (h.isCash) return h.value
      const excess = h.value.minus((h.targetPct ?? ZERO).div(100).times(total))
      return excess.gt(0) ? excess : ZERO
    }),
  )
  const gaps = deficits(holdings.filter((h) => !h.isCashLike), total)
  const wanted = sum([...gaps.values()])
  const scale = wanted.gt(cash) && wanted.gt(0) ? cash.div(wanted) : new Decimal(1)

  const items: GeneratedItem[] = []
  for (const [id, gap] of gaps) {
    const budget = gap.times(scale)
    let frequency: Frequency = 'once'
    for (const f of ['daily', 'weekly'] as const) {
      if (budget.div(executionCount(f, durationDays)).gte(minOrder)) {
        frequency = f
        break
      }
    }
    const executions = executionCount(frequency, durationDays)
    const fixedAmount = toCents(budget.div(executions))
    if (fixedAmount.lte(0)) continue
    items.push({ id, frequency, fixedAmount, executions, total: fixedAmount.times(executions) })
  }
  const planTotal = sum(items.map((i) => i.total))
  return { items, total: planTotal, cash, reserve: Decimal.max(cash.minus(planTotal), ZERO) }
}
