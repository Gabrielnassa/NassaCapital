// Texto e hora do lembrete diário. Puro, testado pelo Vitest.

export interface DueItem {
  ticker: string
  /** valor previsto da execução */
  amount: number
  currency: 'BRL' | 'USD'
  /** AAAA-MM-DD */
  date: string
}

/** Hora (0–23) e data (AAAA-MM-DD) agora em Brasília. */
export function brasiliaNow(now: Date): { hour: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { hour: Number(get('hour')), date: `${get('year')}-${get('month')}-${get('day')}` }
}

const money = (v: number, ccy: 'BRL' | 'USD') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: ccy }).format(v).replace(/\u00a0/g, ' ')

/**
 * "Comprar hoje: BTC US$ 26,90 · ETH US$ 33,50" e, se houver, "· 2 atrasadas".
 * Sem nada para hoje mas com atrasadas: "Compras atrasadas: 2 (BTC, ETH)". Sem nada: null.
 */
export function reminderText(items: DueItem[], today: string): { title: string; body: string } | null {
  const todayItems = items.filter((i) => i.date === today)
  const overdue = items.filter((i) => i.date < today)
  if (!todayItems.length && !overdue.length) return null
  const late = overdue.length === 1 ? '1 atrasada' : `${overdue.length} atrasadas`
  if (todayItems.length) {
    const list = todayItems.map((i) => `${i.ticker} ${money(i.amount, i.currency)}`).join(' · ')
    return { title: 'Comprar hoje', body: overdue.length ? `${list} · ${late}` : list }
  }
  const tickers = [...new Set(overdue.map((i) => i.ticker))].join(', ')
  return { title: 'Compras atrasadas', body: `${late}: ${tickers}` }
}
